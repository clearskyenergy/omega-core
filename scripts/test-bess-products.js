#!/usr/bin/env node
/* The tenant's own battery leads — and its engineering fields stay private.
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   Two failures this guards, both silent and both expensive:

   1 · A WHITE-LABELLED MANUFACTURER'S GUIDED BUILD SPECS A COMPETITOR.
       editor.html ships 29 products from 7 manufacturers and defaults its
       manufacturer field to "Gotion". If a tenant's own products do not lead,
       Clean Cell's sales team lays out Gotion containers on Clean Cell's own
       platform, and nobody notices until a customer does.

   2 · THE SHARED PRODUCT LIST LEAKS ENGINEERING DATA TO THE PUBLIC.
       One list now feeds the storefront, the site study AND the guided build.
       That is only safe because api/embed-config.js constructs its response
       key by key. The moment somebody "simplifies" that into a spread, a
       tenant's inverter selection, integration flags and usable-energy
       figures are on a public web page.

   node scripts/test-bess-products.js */
'use strict';
var fs = require('fs'), path = require('path');
var ROOT = path.join(__dirname, '..');
var P = require(path.join(ROOT, 'omega-bess-products.js'));

var pass = 0, fail = 0;
function ok(name, cond, got) {
  if (cond) { pass++; return; }
  fail++; console.error('  FAIL ' + name + (got !== undefined ? '  got: ' + JSON.stringify(got) : ''));
}

var PRODUCT = {
  sku: 'CC-2000', name: 'CleanCell 2000 container', kw: 500, kwh: 2000,
  widthFt: 20, depthFt: 8, priceMode: 'list', listPrice: 410000,
  chem: 'LFP', usableKwh: 1900, dcv: '1331V',
  inverter: 'Integrated PCS', inverterKva: 500,
  transformer: '750KVA 480/480V', disconnect: '800A 480V',
  integrates: { pcs: true, xfmr: false, disco: true },
  notes: 'Internal thermal + suppression.'
};

/* ── 1 · Mapping ───────────────────────────────────────────────────────── */
var made = P.toCatalogEntry('cleancell', PRODUCT);
ok('a product maps to a catalogue entry', !!made);
ok('the key is namespaced by org', made.key.indexOf('CLEANCELL') === 0, made.key);
ok('the key is safe as an object key', /^[A-Z0-9\-]+$/.test(made.key), made.key);

var e = made.entry;
ok('kW carries over', e.kw === 500, e.kw);
ok('kWh carries over', e.kwh === 2000, e.kwh);
ok('usable energy carries over', e.usable === 1900, e.usable);
ok('duration is derived when not given', e.dur === 4, e.dur);
ok('the footprint carries over for the site study', e.widthFt === 20 && e.depthFt === 8, e);
ok('dims are rendered for the drawing', /20/.test(e.dims) && /8/.test(e.dims), e.dims);
ok('the entry is marked as the tenant\'s own', e._tenant === true);

/* The integration flags decide whether getWizSteps() SKIPS the PCS,
   disconnect and transformer steps. Getting one wrong draws a one-line that
   would not be built. */
ok('integrates.pcs maps to _incPCS', e._incPCS === true, e._incPCS);
ok('integrates.disco maps to _incDisco', e._incDisco === true, e._incDisco);
ok('integrates.xfmr false maps to _incXfmr false', e._incXfmr === false, e._incXfmr);
var bare = P.toCatalogEntry('x', { sku: 'A', kwh: 100 }).entry;
ok('a product with no integrates block integrates nothing',
   bare._incPCS === false && bare._incXfmr === false && bare._incDisco === false, bare);

/* ── 2 · NO PRICE IN THE BROWSER CATALOGUE ─────────────────────────────
   The source product carries listPrice: 410000. It must not survive into a
   catalogue entry that sits in page source. */
var blob = JSON.stringify(e);
ok('the listPrice does NOT reach the catalogue entry', blob.indexOf('410000') < 0, blob);
ok('no eqcost is invented', e.eqcost === undefined, e.eqcost);
['price', 'cost', 'eqcost', 'listPrice', '$'].forEach(function (w) {
  ok('the entry mentions no "' + w + '"', blob.toLowerCase().indexOf(w.toLowerCase()) < 0);
});

/* ── 3 · Refusals ──────────────────────────────────────────────────────── */
ok('a product with no sku is refused', P.toCatalogEntry('x', { kwh: 100 }) === null);
ok('a product with no kW and no kWh is refused', P.toCatalogEntry('x', { sku: 'A' }) === null);
ok('a null product is refused', P.toCatalogEntry('x', null) === null);
ok('kW alone is enough', !!P.toCatalogEntry('x', { sku: 'A', kw: 50 }));

/* ── 4 · The merge is additive ────────────────────────────────────────
   A saved drawing references a catalogue key. Removing or overwriting a
   shipped entry would re-render somebody's existing project as a different
   battery, silently. */
var shipped = { 'GOTION-EDGE-760': { mfr: 'Gotion', model: 'Gotion EDGE 760', kwh: 760 } };
var before = JSON.stringify(shipped['GOTION-EDGE-760']);
shipped[made.key] = undefined; delete shipped[made.key];
/* mergeInto needs Firestore; exercise the same rule directly. */
(function mergeRule() {
  var cat = { 'GOTION-EDGE-760': shipped['GOTION-EDGE-760'] };
  var t = { count: 1, keys: [made.key], entries: {} };
  t.entries[made.key] = e;
  for (var i = 0; i < t.keys.length; i++) if (!cat[t.keys[i]]) cat[t.keys[i]] = t.entries[t.keys[i]];
  ok('the tenant entry is added', !!cat[made.key]);
  ok('the shipped entry is untouched', JSON.stringify(cat['GOTION-EDGE-760']) === before);
  /* And a colliding key cannot clobber. */
  var cat2 = { 'GOTION-EDGE-760': { mfr: 'Gotion', kwh: 760 } };
  var t2 = { keys: ['GOTION-EDGE-760'], entries: { 'GOTION-EDGE-760': { mfr: 'Impostor', kwh: 1 } } };
  for (var j = 0; j < t2.keys.length; j++) if (!cat2[t2.keys[j]]) cat2[t2.keys[j]] = t2.entries[t2.keys[j]];
  ok('a colliding key does not overwrite the shipped product', cat2['GOTION-EDGE-760'].mfr === 'Gotion');
})();

/* ── 5 · THE PUBLIC SUBSET IS STILL A SUBSET ──────────────────────────
   One list feeds three surfaces. api/embed-config.js is the only thing
   standing between the engineering fields and a stranger's browser, and it
   holds only because it constructs its response key by key. */
var cfgSrc = fs.readFileSync(path.join(ROOT, 'api', 'embed-config.js'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '');      /* strip comments; they discuss the fields */

['inverter', 'inverterKva', 'transformer', 'disconnect', 'integrates',
 'usableKwh', 'dcv', 'notes'].forEach(function (f) {
  ok('embed-config does NOT publish "' + f + '"',
     cfgSrc.indexOf(f) < 0, (new RegExp('.{0,50}' + f + '.{0,50}').exec(cfgSrc) || [])[0]);
});
ok('embed-config still publishes the footprint the site study needs',
   /widthFt/.test(cfgSrc) && /depthFt/.test(cfgSrc));
ok('embed-config still builds its product key by key, not by spread',
   !/\.\.\.p\b/.test(cfgSrc) && !/Object\.assign\(/.test(cfgSrc));

/* ── 6 · The editor actually consults it ──────────────────────────────── */
var ed = fs.readFileSync(path.join(ROOT, 'editor.html'), 'utf8');
ok('editor.html loads omega-bess-products.js', /src="\/omega-bess-products\.js"/.test(ed));
ok('editor.html merges the tenant catalogue', /OmegaBessProducts\.load\(\)/.test(ed));
ok('the merge does not overwrite a shipped key',
   /if \(!BESS_CATALOG\[k\]\) BESS_CATALOG\[k\] = t\.entries\[k\]/.test(ed));
ok('the tenant optgroup is prepended, not appended',
   /insertBefore\(grp, first\)/.test(ed));
ok('the manufacturer default stops saying Gotion',
   /mfr\.value === 'Gotion'/.test(ed));

/* The shipped catalogue and its Gotion default are still THERE — this
   feature is additive, and a developer tenant must keep every option. */
ok('the shipped catalogue is still present', /const BESS_CATALOG = \{/.test(ed));
ok('Gotion products are still shipped', /GOTION-EDGE-760/.test(ed));

/* ── 7 · THE EDITOR HOOK, ACTUALLY RUN ────────────────────────────────
   Asserting that the source CONTAINS insertBefore proves nothing about
   whether it runs. So the real block is lifted out of editor.html and
   executed against stubs — the same bytes that ship, not a copy that can
   drift away from them. */
(function editorHookRuns() {
  var marker = "/* ── THE TENANT'S OWN PRODUCTS LEAD ";
  var at = ed.indexOf(marker);
  ok('the hook is findable in editor.html', at > 0);
  if (at < 0) return;
  var start = ed.indexOf('(function () {', at);
  var end = ed.indexOf('\n})();', start);
  ok('the hook is a self-contained IIFE', start > 0 && end > start);
  if (!(start > 0 && end > start)) return;
  var src = ed.slice(start, end + 6);

  /* A DOM stub with only what the hook touches. */
  function El(tag) {
    this.tag = tag; this.children = []; this.id = ''; this.label = ''; this.value = '';
    this.textContent = ''; this.placeholder = '';
  }
  El.prototype.appendChild = function (c) { this.children.push(c); return c; };
  El.prototype.insertBefore = function (c, ref) {
    var i = this.children.indexOf(ref);
    this.children.splice(i < 0 ? 0 : i, 0, c); return c;
  };
  El.prototype.querySelector = function (sel) {
    for (var i = 0; i < this.children.length; i++) if (this.children[i].tag === sel) return this.children[i];
    return null;
  };

  var shippedGroup = new El('optgroup'); shippedGroup.label = 'Gotion';
  var sel = new El('select');
  sel.appendChild(new El('option'));     /* the "-- choose a model --" placeholder */
  sel.appendChild(shippedGroup);
  var mfr = new El('input'); mfr.value = 'Gotion';

  var byId = { 'bm-catalog': sel, 'bm-mfr': mfr };
  var doc = {
    readyState: 'complete',
    getElementById: function (id) { return byId[id] || null; },
    createElement: function (t) { return new El(t); },
    addEventListener: function () {}
  };

  var CAT = { 'GOTION-EDGE-760': { mfr: 'Gotion', model: 'Gotion EDGE 760', kwh: 760 } };
  var tenant = { brand: 'Clean Cell', count: 1, keys: [made.key], entries: {} };
  tenant.entries[made.key] = e;

  var win = {
    OmegaBessProducts: { load: function () { return Promise.resolve(tenant); } },
    firebase: { apps: [1], auth: function () { return { currentUser: { email: 'a@cleancell.us' } }; } }
  };

  var run = new Function('window', 'document', 'BESS_CATALOG', 'setTimeout', 'OmegaBessProducts', 'firebase',
    src + '\nreturn true;');
  var ranOk = true;
  try {
    run(win, doc, CAT, function (fn) { return setTimeout(fn, 0); },
        win.OmegaBessProducts, win.firebase);
  } catch (err) { ranOk = false; ok('the hook executes without throwing', false, err.message); }

  if (ranOk) {
    /* The load() promise resolves on a microtask; assert after it drains. */
    setTimeout(function () {
      ok('the hook added the tenant product to BESS_CATALOG', !!CAT[made.key], Object.keys(CAT));
      ok('and left the shipped Gotion entry alone',
         CAT['GOTION-EDGE-760'] && CAT['GOTION-EDGE-760'].mfr === 'Gotion');
      var grp = sel.children.filter(function (c) { return c.tag === 'optgroup'; })[0];
      ok('the tenant optgroup is FIRST among the optgroups',
         grp && grp.id === 'bm-cat-tenant', grp && grp.label);
      ok('and it is labelled with the tenant brand',
         grp && /Clean Cell/.test(grp.label), grp && grp.label);
      /* Guarded: when the prepend regresses, `grp` is the SHIPPED optgroup,
         which has no children — and a test that throws there reports a stack
         trace instead of the assertion that actually broke. */
      var opt0 = (grp && grp.children[0]) ? grp.children[0].textContent : '';
      ok('and it carries the product as an option',
         !!grp && grp.children.length === 1 && /CleanCell 2000/.test(opt0), opt0);
      ok('the option notes the integrated PCS', /PCS integrated/.test(opt0), opt0);
      ok('the placeholder option is still first overall', sel.children[0].tag === 'option');
      ok('the manufacturer default is no longer Gotion', mfr.value === 'Clean Cell', mfr.value);
      finish();
    }, 20);
  } else finish();
})();

function finish() {
/* ── 8 · Safe on a page with nothing ──────────────────────────────────── */
ok('orgId() returns empty rather than throwing with no globals',
   typeof P.orgId() === 'string');
P._reset();
P.load().then(function (t) {
  ok('load() resolves to an empty set with no Firebase', t && t.count === 0, t);
  console.log('\ntenant BESS products: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}, function () {
  ok('load() never rejects', false);
  console.log('\ntenant BESS products: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(1);
});
}
