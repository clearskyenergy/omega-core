/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   Modular data-center units, bulk-loaded from a vendor's spreadsheet into
   the editor's equipment library and from there into the placement pickers.

   Two halves. omega-import.js is a UMD module, so its MDC_SPEC is exercised
   directly: header synonyms, MW and metres converted, a hedge refused, a
   stable key derived from manufacturer + model, a re-upload resolved as an
   update. The editor half — _dcCatalogSync, _e3DcDoc and friends — is cut
   straight out of editor.html and run in a sandbox with a stubbed registry,
   the way the geometry tests reach their functions, because there is no
   module system to import them through.

     node scripts/tests/tmdcimport.js                                       */
'use strict';
const path = require('path'), fs = require('fs'), vm = require('vm');
const ROOT = path.join(__dirname, '..', '..');

let fails = 0;
function ok(c, m) { if (!c) { fails++; console.log('  FAIL ' + m); } else console.log('  ok   ' + m); }
function count(s, needle) { return s.split(needle).length - 1; }

const I = require(path.join(ROOT, 'omega-import.js'));
const M = I.MDC_SPEC;

/* ── 1. the spec reads a vendor sheet in the vendor's units ───────────── */
console.log('MDC_SPEC: a vendor line card');
{
  const table = {
    headers: ['Manufacturer', 'Model', 'IT load (MW)', 'Length (m)', 'Width (m)', 'Height (mm)',
              'Cooling', 'Water (gpd)', 'Volts', 'UPS', 'Datasheet', 'Lead time'],
    rows: [
      ['Armada', 'Leviathan', 1.77, 36.27, 13.72, 3000, 'closed loop', 0, 480, 'yes', 'armada.ai/product/leviathan', '26 wk'],
      ['Acme',   'Box',       '~1', 12,    '',    '',   'liquid',      '', '',  '',    '', ''],
      ['Acme',   'Node',      0.5,  12,    3,     '',   'chiller yard', 400, 480, 'no', '', '']
    ]
  };
  const r = I.validate(table, M, []);
  ok(r.mapped.indexOf('mw_it') >= 0 && r.mapped.indexOf('length_m') >= 0 && r.mapped.indexOf('height_mm') >= 0,
     'MW, metres and millimetres columns are recognised by their own names');
  ok(r.unmapped.length === 1 && r.unmapped[0] === 'Lead time', 'a column with no home is reported, not lost silently');
  ok(r.ready.length === 2 && r.problems.length === 1, 'two rows land, one is held back');

  const lev = r.ready[0].rec;
  ok(lev.kw_it === 1770, 'IT load 1.77 MW is stored as 1770 kW (' + lev.kw_it + ')');
  ok(lev.length_ft === 119 && lev.width_ft === 45, '36.27 x 13.72 m is the published 119 x 45 ft (' + lev.length_ft + ' x ' + lev.width_ft + ')');
  ok(lev.height_ft === 9.8, '3000 mm is 9.8 ft (' + lev.height_ft + ')');
  ok(lev.mw_it === undefined && lev.length_m === undefined && lev.height_mm === undefined, 'the source-unit fields do not survive into the record');
  ok(lev.cooling === 'integrated-closed-loop', '"closed loop" is the closed-loop product class');
  ok(lev.ups === 'integrated', '"yes" in a UPS column means the unit carries one');
  ok(lev.water_gpd === 0, 'zero water is recorded as zero, not dropped as empty');
  ok(lev.key === 'MDC-ARMADA-LEVIATHAN', 'a key is derived from manufacturer + model (' + lev.key + ')');
  ok(r.hasDedupe === true, 'and with every row keyed, there is no "no id column" warning');

  const node = r.ready[1].rec;
  ok(node.cooling === 'external' && node.ups === 'none', '"chiller yard" is external cooling, "no" is no UPS');
  ok(node.kw_it === 500, '0.5 MW is 500 kW');

  const bad = r.problems[0];
  ok(/mw_it: "~1" is approximate/.test(bad.why.join(';')), 'a hedged load is refused, not recorded as 1 MW');
  ok(/cooling: "liquid" is not a known type/.test(bad.why.join(';')), '"liquid" is refused rather than guessed at');
  ok(/kw_it is empty/.test(bad.why.join(';')) && /width_ft is empty/.test(bad.why.join(';')), 'a unit with no load and no width is not a unit');
  ok(M.label(bad.rec) === 'Acme Box', 'the held-back row is named by manufacturer and model');
}

/* ── 2. a re-upload is an update, a duplicate row is a duplicate ─────── */
console.log('MDC_SPEC: re-uploads and duplicates');
{
  const existing = [{ key: 'MDC-ARMADA-LEVIATHAN', _docId: 'doc1', notes: 'typed by hand' }];
  const table = {
    headers: ['Vendor', 'Product', 'kW', 'L (ft)', 'W (ft)', 'SKU'],
    rows: [
      ['Armada', 'Leviathan', 1770, 119, 45, ''],
      ['Armada', 'Leviathan', 1770, 119, 45, ''],
      ['Vertiv', 'SmartMod', 300, 40, 12, 'vtv smartmod 300']
    ]
  };
  const r = I.validate(table, M, existing);
  ok(r.ready.length === 2 && r.updating === 1, 'one row updates the existing unit, one is new');
  ok(r.ready[0].updates && r.ready[0].updates._docId === 'doc1', 'the update carries the existing document');
  ok(r.problems.length === 1 && /duplicate key/.test(r.problems[0].why[0]), 'the same unit twice in one sheet is held back');
  ok(r.ready[1].rec.key === 'VTV-SMARTMOD-300', 'a SKU the sheet supplies is kept, upper-cased, spaces to dashes (' + r.ready[1].rec.key + ')');
}

/* ── 3. floors ────────────────────────────────────────────────────────── */
console.log('minimums are enforced');
{
  const r = I.validate({ headers: ['Make', 'Model', 'IT kW', 'Length', 'Width', 'PUE'],
                         rows: [['A', 'B', 0, 40, 10, 0.9], ['A', 'C', -5, 40, 10, '']] }, M, []);
  ok(r.problems.length === 2, 'a 0 kW unit and a negative one are both refused');
  ok(/kw_it: "0" is below the minimum/.test(r.problems[0].why.join(';')), 'zero load is below the floor');
  ok(/pue: "0.9" is below the minimum of 1/.test(r.problems[0].why.join(';')), 'a PUE under 1 is not a PUE');
}

/* ── 4. the template ──────────────────────────────────────────────────── */
console.log('the template');
{
  const t = I.templateRows(M);
  ok(t.length === 3 && t[0].length === 17 && t[1].length === 17 && t[2].length === 17, 'headers plus two example rows, all the same width');
  const r = I.validate({ headers: t[0], rows: t.slice(1) }, M, []);
  ok(r.problems.length === 0 && r.ready.length === 2, 'the template imports cleanly as written');
  ok(r.unmapped.length === 0, 'every template column is one the upload reads');
  ok(r.ready[0].rec.key === 'MDC-ARMADA-LEVIATHAN' && r.ready[0].rec.kw_it === 1770, 'the example row is the published unit');
}

/* ── 5. the project import still works as it did ─────────────────────── */
console.log('PROJECT_SPEC regression');
{
  const r = I.validate({ headers: ['Site Name', 'MW', 'Site ID'], rows: [['A', '5', 'x1'], ['B', '', 'x2']] },
                       I.PROJECT_SPEC, [{ intakeId: 'x1' }]);
  ok(r.ready.length === 2 && r.updating === 1 && r.ready[0].updates.intakeId === 'x1', 'intakeId still matches external_id for an update');
  ok(r.hasDedupe === true, 'a mapped id column is detected');
  const r2 = I.validate({ headers: ['Site Name'], rows: [['A']] }, I.PROJECT_SPEC, []);
  ok(r2.hasDedupe === false, 'and with no id column and nothing derived, the warning still fires');
  ok(I.mapHeaders(['Site Name', 'MW'])[0] === 'name', 'mapHeaders with no spec still reads the project synonyms');
  ok(I.PROJECT_SPEC.noun === 'project' && M.noun === 'unit', 'each spec names what a row is');
}

/* ── 6. the editor half ───────────────────────────────────────────────── */
console.log('editor.html');
const s = fs.readFileSync(path.join(ROOT, 'editor.html'), 'utf8');
ok(/<script src="\/omega-import\.js"><\/script>/.test(s), 'omega-import.js is loaded');
['_dcCatalogSync', '_dcIdForKey', '_dcFlyoutSync', '_e3DcDoc', 'e3DcTemplate', 'e3DcUploadOpen'].forEach(function (n) {
  ok(count(s, 'function ' + n + '(') === 1, n + ' is defined exactly once');
});
ok(/if\(typeof _dcCatalogSync==='function'\) _dcCatalogSync\(\);/.test(s), 'OmegaEq.load projects uploaded units into the catalog');
ok(/if\(c\.org\) continue;/.test(s), 'the seed view skips units the sync projected in, so they are not listed twice');
ok(/if\(!doc\._docId \|\| !doc\.uid\) doc\.uid=uid;/.test(s), 'OmegaEq.save keeps the creator on an update, as the rules require');
ok(/onclick="e3DcUploadOpen\(\)"/.test(s) && /onclick="e3DcTemplate\(\)"/.test(s), 'the Data Center tab offers Upload and Template');
ok(/if\(typeof OmegaEq!=='undefined'\) OmegaEq\.load\(true\);/.test(s), 'sign-in loads the org library so the pickers carry uploaded units');
ok(/body \.oim-scrim\{ z-index:9700 \}/.test(s), 'the import preview stacks above the equipment modal');
ok(/spec:OmegaImport\.MDC_SPEC/.test(s), 'the upload uses the modular data-center spec');

/* Cut the block out and run it against a stubbed registry. */
{
  const a = s.indexOf('var _DC_SEED_IDS'), b = s.indexOf('/* The blank sheet, with the columns');
  ok(a > 0 && b > a, 'the catalog-sync block is where the test expects it');
  const code = s.slice(a, b);
  ok(!/\basync\b|\bawait\b|=>|\bconst\b|\blet\b/.test(code), 'the block is ES5');

  const DC_CATALOG = {
    dc_mdc1:      { label: '1 MW Modular Data Center', kw: 1000, lf: 40, wf: 10 },
    dc_leviathan: { label: '1.77 MW Modular Data Center', kw: 1770, lf: 119, wf: 45 }
  };
  const DERC_DC = { dc_mdc1: { label: '1 MW Modular Data Center', kw: 1000, lf: 40, wf: 10 } };
  let items = [];
  const ctx = {
    DC_CATALOG, DERC_DC, console,
    OmegaEq: { all: function () { return items; } },
    document: { getElementById: function () { return null; } },
    rbFlyDo: function () {}, derSetDc: function () {}
  };
  vm.createContext(ctx);
  vm.runInContext(code, ctx);

  ok(ctx._dcIdForKey('MDC-ARMADA-LEVIATHAN') === 'dc_mdc_armada_leviathan', 'a key becomes a dc_ id that cannot collide with a seed');
  ok(ctx._dcIdForKey('') === '', 'an empty key gives no id');

  items = [
    { key: 'DC-DC_MDC1', cat: 'datacenter', manufacturer: 'Generic', model: 'x', powerKw: 1000, lengthMm: 12192, widthMm: 3048 },
    { key: 'MDC-ARMADA-LEVIATHAN', cat: 'datacenter', manufacturer: 'Armada', model: 'Leviathan', powerKw: 1770,
      lengthFt: 119, widthFt: 45, cooling: 'integrated-closed-loop', waterGpd: 0, volts: 480, verified: 'armada.ai' },
    { key: 'MDC-VERTIV-SMARTMOD', cat: 'datacenter', manufacturer: 'Vertiv', model: 'SmartMod', powerKw: 300,
      lengthMm: 12192, widthMm: 3658, archived: true },
    { key: 'MDC-NOFOOT', cat: 'datacenter', manufacturer: 'A', model: 'B', powerKw: 500 },
    { key: 'ORG-GOTION-X', cat: 'bess', manufacturer: 'Gotion', model: 'X', powerKw: 500, lengthMm: 6000, widthMm: 2400 },
    { key: 'DC-DC_LEVIATHAN', cat: 'datacenter', _seed: true, manufacturer: 'Armada', model: 'L', powerKw: 1770 }
  ];
  const n = ctx._dcCatalogSync();
  ok(n === 1, 'one live, drawable, non-seed compute module is projected (' + n + ')');
  const u = DC_CATALOG.dc_mdc_armada_leviathan;
  ok(u && u.org === true && u.kw === 1770 && u.lf === 119 && u.wf === 45, 'it lands in DC_CATALOG at its real footprint and load');
  ok(u && u.cooling === 'integrated-closed-loop' && u.water === 0 && u.volts === 480 && u.verified === 'armada.ai', 'cooling, water, voltage and source travel with it');
  ok(DERC_DC.dc_mdc_armada_leviathan && DERC_DC.dc_mdc_armada_leviathan.lf === 119, 'and in DERC_DC, which the cluster dialog and derSetDc read');
  ok(!DC_CATALOG.dc_dc_dc_mdc1 && !DC_CATALOG.dc_dc_mdc1, 'the published seed copy is not projected as a second row');
  ok(!DC_CATALOG.dc_mdc_vertiv_smartmod, 'an archived unit is not offered for placement');
  ok(!DC_CATALOG.dc_mdc_nofoot, 'a unit with no footprint cannot be drawn and is not offered');
  ok(!DC_CATALOG.dc_org_gotion_x, 'a BESS cabinet is not a compute module');
  ok(DC_CATALOG.dc_mdc1 && DC_CATALOG.dc_leviathan, 'the seed is untouched');

  items = items.map(function (it) { return it.key === 'MDC-ARMADA-LEVIATHAN' ? Object.assign({}, it, { archived: true }) : it; });
  ok(ctx._dcCatalogSync() === 0 && !DC_CATALOG.dc_mdc_armada_leviathan && !DERC_DC.dc_mdc_armada_leviathan,
     'archiving the unit removes it from both catalogs on the next sync');

  /* the doc a row becomes */
  const fresh = ctx._e3DcDoc({ key: 'MDC-A-B', manufacturer: 'A', model: 'B', kw_it: 1000, length_ft: 40, width_ft: 10,
                                cooling: 'integrated', water_gpd: 0, notes: 'first' }, null, 'imp_1');
  ok(fresh.cat === 'datacenter' && fresh.sub === 'module' && fresh.type === 'Compute module', 'a new row is a compute module');
  ok(fresh.powerKw === 1000 && fresh.pmaxKw === 1000 && fresh.energyKwh === 0, 'load is power, and there is no energy');
  ok(fresh.lengthMm === 12192 && fresh.widthMm === 3048 && fresh.lengthFt === 40, 'feet are stored, and millimetres for the library table');
  ok(fresh.importBatch === 'imp_1' && fresh.archived === false, 'it carries its batch and is live');

  const prev = Object.assign({}, fresh, { _docId: 'doc9', uid: 'u-creator', notes: 'typed by hand', costUsd: 1500000 });
  const upd = ctx._e3DcDoc({ key: 'MDC-A-B', manufacturer: 'A', model: 'B', kw_it: 1100, length_ft: 40, width_ft: 10 }, prev, 'imp_2');
  ok(upd._docId === 'doc9' && upd.uid === 'u-creator', 'an update keeps the document and its creator');
  ok(upd.powerKw === 1100 && upd.notes === 'typed by hand' && upd.costUsd === 1500000, 'only what the sheet carries is written over; the rest survives');
  ok(upd.importBatch === 'imp_2', 'and the batch moves to the upload that last touched it');
}

console.log(fails ? '\n' + fails + ' FAILED' : '\nall passed');
process.exit(fails ? 1 : 0);
