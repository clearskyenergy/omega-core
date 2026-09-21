#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════════
   scripts/import-products.js — a manufacturer's product list, into the platform
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   DRY RUN BY DEFAULT. Prints a readiness report. Pass --apply to write.

     node scripts/import-products.js --org cleancell.us --file products.csv
     FIREBASE_SERVICE_ACCOUNT="$(cat sa.json)" \
       node scripts/import-products.js --org cleancell.us --file products.csv --apply

   ONE LIST, THREE SURFACES. It writes
   omega_orgs/{orgId}/storefront/config.products, which drives:

     · the public storefront   (api/embed-config.js — the published subset)
     · the site study          (widthFt/depthFt, drawn to scale on their lot)
     · the BESS Guided Build   (omega-bess-products.js — the full record)

   So the same spreadsheet decides what a stranger can order, what their yard
   study looks like, and what the editor lays out. That is why the report
   below is about what each product UNLOCKS rather than how many rows parsed:
   a product with no footprint is silently not offered a site study, and a
   product with no integration flags silently draws the wrong one-line.

   ─────────────────────────────────────────────────────────────────────────────
   THE TWO COLUMNS PEOPLE LEAVE OUT, AND WHAT IT COSTS
   ─────────────────────────────────────────────────────────────────────────────
   widthFt / depthFt — without them api/embed-config.js reports the product as
     undrawable and the site study is never offered for it. There is NO
     default footprint anywhere in the platform, on purpose: a made-up size
     drawn to scale on somebody's own parcel is the most convincing kind of
     wrong.

   integratesPcs / integratesXfmr / integratesDisco — getWizSteps() in
     editor.html SKIPS the PCS, disconnect and transformer steps when the
     cabinet already contains them, and re-routes the one-line. Left blank,
     every product is assumed to integrate nothing, and an all-in-one cabinet
     gets drawn with an external PCS: a one-line that would not be built.
     Blank is therefore REPORTED, not silently accepted.

   ─────────────────────────────────────────────────────────────────────────────
   DIMENSIONS ARRIVE IN MILLIMETRES
   ─────────────────────────────────────────────────────────────────────────────
   Every container datasheet in this industry prints mm — Gotion's is
   6058 x 2438 x 2896. Pasted into a feet column that is a 6,058 ft battery,
   and the site study would cheerfully report that nothing fits on a 3-acre
   lot. So there is a `dimUnits` column (ft | in | mm | m, default ft) and a
   plausibility check AFTER conversion. Guessing the units from the magnitude
   would be the clever version; it would also be wrong for a 40 ft container
   entered as 40.

   ─────────────────────────────────────────────────────────────────────────────
   NO COST BASIS. NOT EVEN ACCIDENTALLY.
   ─────────────────────────────────────────────────────────────────────────────
   capexPerKwh / capexPerKw are the tenant's negotiated BUY price and belong
   on the Firestore record, set by hand — CLAUDE.md, and seed-omega-orgs.js
   throws if a tenant.json carries one. A column by either name here is a hard
   error, because a spreadsheet from a supplier is exactly where one turns up.

   `listPrice` is different and is allowed: it is a number the tenant has
   chosen to PRINT IN PUBLIC, and it only publishes when priceMode is 'list'.

   ─────────────────────────────────────────────────────────────────────────────
   COMPONENTS AND BILLS OF MATERIALS  (--bom bom.csv)
   ─────────────────────────────────────────────────────────────────────────────
   A row with `kind` = component is what a product is MADE OF — a cell, a
   module, a BMS. It needs no kW or kWh, is never published, drawn or priced,
   and may carry `unit`, `supplier`, `supplierSku`, `moq` and `leadTimeDays`
   for the materials plan (api/_lib/materials.js). A second sheet,
   `--bom bom.csv`, with columns  parentSku, componentSku, qty, unit  lists
   what goes into ONE of each product or sub-assembly. Every componentSku must
   be a row in the products file, none may be a service, and the whole thing
   must be loop-free — the same checks api/logic-catalog.js makes on save,
   because a loop hangs the plan and a missing SKU silently under-buys.

   Still no cost basis: a component's buy price is exactly the number that
   turns up on a supplier's sheet, and the FORBIDDEN list above applies to
   both files.
   ═══════════════════════════════════════════════════════════════════════════════ */
'use strict';
var fs = require('fs'), path = require('path');
var engine = require(path.join(__dirname, '..', 'api', '_lib', 'bess-engine.js'));
var materials = require(path.join(__dirname, '..', 'api', '_lib', 'materials.js'));

function arg(name, dflt) {
  var i = process.argv.indexOf('--' + name);
  if (i < 0) return dflt;
  var v = process.argv[i + 1];
  return (v && v.slice(0, 2) !== '--') ? v : true;
}
var APPLY = process.argv.indexOf('--apply') >= 0;
/* --out <file.json>: write the parsed products to disk instead of (or as well
   as) Firestore. Two uses, both real — reviewing EXACTLY what would be stored
   before committing to it, and feeding scripts/preview-storefront.js so the
   preview runs on the same catalogue the import produced rather than a
   hand-kept copy that drifts. */
var OUT = (function () {
  var i = process.argv.indexOf('--out');
  return (i >= 0 && process.argv[i + 1] && process.argv[i + 1].slice(0, 2) !== '--') ? process.argv[i + 1] : '';
})();
var FORCE = process.argv.indexOf('--force') >= 0;
var ORG = String(arg('org', '') || '').toLowerCase();
var FILE = String(arg('file', '') || '');
var BOM = (function () { var v = arg('bom', ''); return v === true ? '' : String(v || ''); })();

function die(msg) { console.error('\n' + msg + '\n'); process.exit(1); }
if (!ORG) die('Pass --org <orgId>, e.g. --org cleancell.us');
if (!FILE) die('Pass --file <products.csv>   (or a .json array)');
if (!fs.existsSync(FILE)) die('No such file: ' + FILE);
if (BOM && !fs.existsSync(BOM)) die('No such file: ' + BOM);

/* ── Columns ───────────────────────────────────────────────────────────── */
var FORBIDDEN = ['capexperkwh', 'capexperkw', 'cost', 'costperkwh', 'buyprice', 'margin'];

var TO_FT = { ft: 1, feet: 1, in: 1 / 12, inch: 1 / 12, inches: 1 / 12,
              mm: 1 / 304.8, m: 3.28084, meter: 3.28084, metre: 3.28084, cm: 1 / 30.48 };

/* A container is 20 or 40 ft; a cabinet is a few feet. Anything outside this
   is a units mistake or a typo, and either way it must not be drawn to scale
   on a customer's parcel. */
var MIN_FT = 0.5, MAX_FT = 80;

function norm(h) { return String(h || '').trim().toLowerCase().replace(/[^a-z0-9]/g, ''); }
function num(v) {
  var s = String(v == null ? '' : v).replace(/[$,\s]/g, '');
  if (s === '') return null;
  var n = Number(s);
  return isFinite(n) ? n : null;
}
function bool(v) {
  var s = String(v == null ? '' : v).trim().toLowerCase();
  if (s === '') return null;                      /* BLANK IS NOT FALSE */
  return ['y', 'yes', 'true', '1', 'x', 'integrated', 'internal'].indexOf(s) >= 0;
}

function readRows(file, allowEmpty) {
  var raw = fs.readFileSync(file, 'utf8');
  if (/\.json$/i.test(file)) {
    var j = JSON.parse(raw);
    if (!Array.isArray(j)) die('A .json product file must be an ARRAY of products.');
    return { rows: j, headers: Object.keys(j[0] || {}).map(norm) };
  }
  var lines = raw.split(/\r?\n/).filter(function (l) { return l.trim() !== ''; });
  /* A header-only BOM sheet means "no bills yet", which is a state; a
     header-only products file is a mistake. */
  if (lines.length < 2 && !allowEmpty) die('That file has a header and no rows.');
  /* splitRow is bess-engine's, so one CSV parser serves the whole estate. */
  var headers = engine.splitRow(lines[0]).map(norm);
  var rows = [];
  for (var i = 1; i < lines.length; i++) {
    var cells = engine.splitRow(lines[i]);
    var o = {};
    for (var c = 0; c < headers.length; c++) o[headers[c]] = (cells[c] || '').trim();
    rows.push(o);
  }
  return { rows: rows, headers: headers };
}

var read = readRows(FILE);
var bomRead = BOM ? readRows(BOM, true) : null;

/* A cost basis in the spreadsheet is a hard stop, not a dropped column. */
var bad = read.headers.concat(bomRead ? bomRead.headers : []).filter(function (h) { return FORBIDDEN.indexOf(h) >= 0; });
if (bad.length) {
  die('This file carries a COST BASIS column: ' + bad.join(', ') + '\n'
    + 'capexPerKwh / capexPerKw are the negotiated buy price. They belong on the\n'
    + 'Firestore record, set by hand, never in a file that gets committed or\n'
    + 'emailed around. Remove the column and re-run.\n'
    + '(listPrice is fine — that is a number you chose to print in public.)');
}

/* ── One row → one product ─────────────────────────────────────────────── */
var problems = [], warnings = [];

function dims(r, sku) {
  var u = norm(r.dimunits || r.units || 'ft');
  var k = TO_FT[u];
  if (!k) { problems.push(sku + ': dimUnits "' + (r.dimunits || r.units) + '" is not one of ft, in, mm, m, cm'); return {}; }
  var w = num(r.widthft != null && u === 'ft' ? r.widthft : (r.width != null ? r.width : r.widthft));
  var d = num(r.depthft != null && u === 'ft' ? r.depthft : (r.depth != null ? r.depth : r.depthft));
  if (w == null || d == null) return {};
  w = +(w * k).toFixed(2); d = +(d * k).toFixed(2);
  if (w < MIN_FT || w > MAX_FT || d < MIN_FT || d > MAX_FT) {
    problems.push(sku + ': footprint works out at ' + w + ' x ' + d + ' ft. '
      + 'That is not a battery — check dimUnits (datasheets print mm).');
    return {};
  }
  return { widthFt: w, depthFt: d };
}

function toProduct(r, i) {
  var sku = String(r.sku || r.model || '').trim();
  if (!sku) { problems.push('row ' + (i + 2) + ': no sku'); return null; }

  var kind = String(r.kind || r.type || 'product').trim().toLowerCase();
  if (['product', 'service', 'component'].indexOf(kind) < 0) { problems.push(sku + ': kind must be product, service or component'); return null; }

  var kw = num(r.kw), kwh = num(r.kwh);
  if (kind === 'product' && !(kw > 0) && !(kwh > 0)) { problems.push(sku + ': needs a kW or a kWh'); return null; }

  /* A component is not sold: no footprint, no integration flags, no price.
     What it needs is what the materials plan reads. */
  if (kind === 'component') {
    var unit = String(r.unit || 'ea').trim();
    if (materials.UNITS.indexOf(unit) < 0) { problems.push(sku + ': unit "' + unit + '" is not one of ' + materials.UNITS.join(', ')); return null; }
    var c = { sku: sku, kind: 'component', name: String(r.name || r.model || sku).trim(),
      blurb: String(r.blurb || r.description || '').trim().slice(0, 400), unit: unit, priceMode: 'quote',
      leadTimeDays: num(r.leadtimedays || r.leadtime), moq: num(r.moq || r.minimumorder),
      supplier: String(r.supplier || r.vendor || '').trim().slice(0, 160),
      supplierSku: String(r.suppliersku || r.supplierpartno || r.supplierpart || r.mpn || '').trim().slice(0, 80),
      integrates: { pcs: false, xfmr: false, disco: false }, bom: [] };
    if (kwh != null) c.kwh = kwh;      /* a module's kWh is a real datasheet fact; the designer still ignores it */
    if (num(r.kw) != null) c.kw = num(r.kw);
    if (String(r.notes || '').trim()) c.notes = String(r.notes).trim();
    if (c.leadTimeDays == null) warnings.push(sku + ': component has no leadTimeDays — the plan cannot compute an order-by date for it.');
    c._hasIntegrationAnswer = true;    /* not a question for a component */
    return c;
  }

  var p = {
    sku: sku,
    kind: kind,
    name: String(r.name || r.model || sku).trim(),
    blurb: String(r.blurb || r.description || '').trim().slice(0, 400),
    kw: kw, kwh: kwh,
    chemistry: String(r.chemistry || r.chem || 'LFP').trim(),
    warrantyYears: num(r.warrantyyears || r.warranty),
    leadTimeDays: num(r.leadtimedays || r.leadtime),
    priceMode: (String(r.pricemode || '').trim().toLowerCase() === 'list') ? 'list' : 'quote',
    bom: []
  };
  if (p.priceMode === 'list') {
    p.listPrice = num(r.listprice);
    if (!(p.listPrice > 0)) {
      warnings.push(sku + ': priceMode is "list" but there is no listPrice — it will show "price on request".');
      p.priceMode = 'quote'; delete p.listPrice;
    }
  }

  var dm = dims(r, sku);
  if (dm.widthFt) { p.widthFt = dm.widthFt; p.depthFt = dm.depthFt; }

  /* Engineering — read by the guided build, never published except the
     integration flags. See api/embed-config.js. */
  ['usableKwh:usablekwh', 'durationH:durationh', 'inverterKva:inverterkva'].forEach(function (m) {
    var a = m.split(':'); var v = num(r[a[1]]);
    if (v != null) p[a[0]] = v;
  });
  ['dcv', 'inverter', 'transformer', 'disconnect', 'notes'].forEach(function (k) {
    var v = String(r[k] || '').trim();
    if (v) p[k] = v;
  });

  var pcs = bool(r.integratespcs || r.pcs), xf = bool(r.integratesxfmr || r.xfmr),
      dc = bool(r.integratesdisco || r.disco);
  if (kind === 'service') { p.integrates = { pcs: false, xfmr: false, disco: false }; p._hasIntegrationAnswer = true; return p; }
  if (pcs === null && xf === null && dc === null) {
    warnings.push(sku + ': no integration flags. The guided build will assume the cabinet '
      + 'integrates NOTHING and draw an external PCS, transformer and disconnect.');
  }
  p.integrates = { pcs: pcs === true, xfmr: xf === true, disco: dc === true };
  p._hasIntegrationAnswer = !(pcs === null && xf === null && dc === null);
  return p;
}

var products = read.rows.map(toProduct).filter(Boolean);

/* Duplicate SKUs silently overwrite each other downstream. */
var seen = {};
products.forEach(function (p) {
  if (seen[p.sku]) problems.push('duplicate sku: ' + p.sku);
  seen[p.sku] = true;
});

/* ── The bill of materials sheet: parentSku, componentSku, qty, unit ────
   Attached to the parent row, then the whole list is checked as a graph
   with the same function the catalog endpoint uses on save. A problem in
   the sheet is a PROBLEM (the parent's bill is dropped), never a silent
   partial bill — a cabinet that "needs" seven modules under-buys cells. */
var bomLines = 0, bomParents = {};
if (bomRead) {
  var pending = {};
  bomRead.rows.forEach(function (r, i) {
    var parent = String(r.parentsku || r.parent || r.productsku || r.product || '').trim();
    var child = String(r.componentsku || r.component || r.childsku || r.child || '').trim();
    if (!parent || !child) { problems.push('bom row ' + (i + 2) + ': needs parentSku and componentSku'); return; }
    if (!seen[parent]) { problems.push('bom row ' + (i + 2) + ': parent ' + parent + ' is not in the products file'); return; }
    if (!seen[child]) { problems.push('bom row ' + (i + 2) + ': component ' + child + ' is not in the products file — add it as a kind=component row'); return; }
    (pending[parent] = pending[parent] || []).push({ sku: child, qty: r.qty || r.quantity || r.qtyper, unit: r.unit || 'ea' });
  });
  Object.keys(pending).forEach(function (parent) {
    var p = products.filter(function (x) { return x.sku === parent; })[0];
    if (!p) return;
    if (p.kind === 'service') { problems.push(parent + ': a service cannot have a bill of materials'); return; }
    try { p.bom = materials.bomLines(pending[parent]); bomLines += p.bom.length; bomParents[parent] = true; }
    catch (e) { problems.push(parent + ': ' + e.message); p.bom = []; }
  });
  try { materials.validateCatalog(products); }
  catch (e) { problems.push('bill of materials: ' + e.message); products.forEach(function (p) { p.bom = []; }); bomLines = 0; bomParents = {}; }
}

/* ── The readiness report ──────────────────────────────────────────────
   Counted by what each product UNLOCKS, because that is the thing an
   operator can act on. "24 rows imported" tells nobody that half the
   catalogue will never appear in a site study. */
var sellable = products.filter(function (p) { return p.kind !== 'component'; });
var components = products.filter(function (p) { return p.kind === 'component'; });
var orderable = sellable.length;
var drawable = sellable.filter(function (p) { return p.widthFt && p.depthFt; }).length;
var oneline = sellable.filter(function (p) { return p._hasIntegrationAnswer; }).length;
var priced = sellable.filter(function (p) { return p.priceMode === 'list'; }).length;

console.log('\n  ' + FILE + (BOM ? ' + ' + BOM : '') + '  →  omega_orgs/' + ORG + '/storefront/config.products');
console.log('  ' + new Array(62).join('─'));
console.log('  ' + String(orderable).padStart(3) + '  orderable on the storefront');
if (components.length || bomRead) {
  console.log('  ' + String(components.length).padStart(3) + '  components (never published; the materials plan reads them)');
  console.log('  ' + String(Object.keys(bomParents).length).padStart(3) + '  with a bill of materials, ' + bomLines + ' line(s) in all'
    + (sellable.length && Object.keys(bomParents).length < sellable.filter(function (p) { return p.kind === 'product'; }).length
        ? '   ← ' + (sellable.filter(function (p) { return p.kind === 'product'; }).length - Object.keys(bomParents).length) + ' product(s) have none, so the plan cannot forecast their materials' : ''));
}
console.log('  ' + String(drawable).padStart(3) + '  drawable on a site study and in the designer'
  + (drawable < orderable ? '   ← ' + (orderable - drawable) + ' missing widthFt/depthFt' : ''));
console.log('  ' + String(oneline).padStart(3) + '  with a stated integration answer'
  + (oneline < orderable ? '   ← ' + (orderable - oneline) + ' will draw an external PCS' : ''));
console.log('  ' + String(priced).padStart(3) + '  showing a public list price (the rest say "price on request")');

if (warnings.length) {
  console.log('\n  WARNINGS — these import, but something will not work as expected:');
  warnings.forEach(function (w) { console.log('    · ' + w); });
}
if (problems.length) {
  console.log('\n  PROBLEMS — these rows were NOT imported:');
  problems.forEach(function (w) { console.log('    ✗ ' + w); });
}
if (!products.length) die('Nothing importable in that file.');

if (drawable === 0 && orderable) {
  console.log('\n  ⚠ NOT ONE PRODUCT HAS A FOOTPRINT. The site study will never be offered');
  console.log('    and the designer cannot draw any of these to scale. Add widthFt and');
  console.log('    depthFt (and dimUnits if the datasheet is in mm).');
}

/* The stored shape drops the reporting flag. */
var out = products.map(function (p) { var q = {}; Object.keys(p).forEach(function (k) { if (k !== '_hasIntegrationAnswer') q[k] = p[k]; }); return q; });

if (OUT) {
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
  console.log('\n  wrote ' + out.length + ' product(s) to ' + OUT);
}

if (!APPLY) {
  console.log('\n  DRY RUN — nothing written to Firestore. Re-run with --apply.');
  console.log('  First product, as it would be stored:');
  console.log('  ' + JSON.stringify(out[0], null, 2).split('\n').join('\n  ') + '\n');
  process.exit(problems.length ? 1 : 0);
}

if (problems.length && !FORCE) {
  die('Refusing to write with ' + problems.length + ' problem row(s). Fix them, or pass --force\n'
    + 'to import the rest and leave those out.');
}
if (!process.env.FIREBASE_SERVICE_ACCOUNT) die('FIREBASE_SERVICE_ACCOUNT is not set.');

var admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
var db = admin.firestore(), FV = admin.firestore.FieldValue;

(async function () {
  var orgRef = db.collection('omega_orgs').doc(ORG);
  var os = await orgRef.get();
  if (!os.exists) die('omega_orgs/' + ORG + ' does not exist. Seed the tenant first:\n'
    + '  node scripts/seed-omega-orgs.js --apply');

  var ref = orgRef.collection('storefront').doc('config');
  var cur = await ref.get();
  var had = (cur.exists && Array.isArray((cur.data() || {}).products)) ? cur.data().products.length : 0;

  /* The products array is REPLACED, not merged. A catalogue is a list, and
     merging two lists by index is how a 2 MWh container inherits a cabinet's
     footprint. The previous list is printed first so a mistake is visible
     before it is made. */
  if (had) console.log('\n  replacing an existing list of ' + had + ' product(s)');
  await ref.set({ products: out, updatedAt: FV.serverTimestamp() }, { merge: true });
  console.log('  written: ' + out.length + ' product(s) to omega_orgs/' + ORG + '/storefront/config\n');

  if (drawable < orderable) {
    console.log('  ⚠ ' + (orderable - drawable) + ' product(s) still have no footprint and will not');
    console.log('    appear in a site study. Re-run once the dimensions arrive.\n');
  }
})().catch(function (e) { console.error(e); process.exit(1); });
