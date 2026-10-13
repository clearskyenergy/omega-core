/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   A BESS unit saved in the Equipment Library IS a BESS Pad (Tommy,
   2026-10-13: "i need to be able to add a bess pad in the equipment library
   and then it shows into the bess pad … if a customer adds a product they
   should be able to draw it"). The three functions are cut straight out of
   editor.html and run on a stub library:
     _bessLibraryUnits()  the org's live BESS entries, feet from mm, a unit
                          with no footprint still offered (askSize)
     _bespadModels()      the shipped table first, in its order, then the
                          library under its own flag
     _bessLibrarySync()   the same units projected into BESS_CATALOG under
                          their own key, never over a shipped entry, an
                          archived one gone */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const SRC = fs.readFileSync(path.join(__dirname, '..', '..', 'editor.html'), 'utf8');
function fn(name) {
  const k = SRC.indexOf('function ' + name + '(');
  if (k < 0) throw new Error(name + ' not found');
  let i = SRC.indexOf('{', k), depth = 0;
  for (let j = i; j < SRC.length; j++) { if (SRC[j] === '{') depth++; else if (SRC[j] === '}' && --depth === 0) return SRC.slice(k, j + 1); }
  throw new Error(name + ' unterminated');
}
let count = 0;
function ok(v, label) { assert(v, label); count++; }

function world(entries) {
  const ctx = {
    BESS_CATALOG: { 'GOTION-EDGE-760': { model: 'Gotion EDGE 760 kWh C&I BESS', kwh: 760, kw: 380 } },
    GOTION_CATALOG_DIMS: { 'GOTION-EDGE-760': { lf: 7.875, wf: 4.59 } },
    OmegaEq: { all() { return entries.filter(e => !e.archived); } },
    document: { getElementById() { return null; } },
    window: {}, console
  };
  vm.createContext(ctx);
  vm.runInContext(fn('_bessLibraryUnits') + '\n' + fn('_bespadModels') + '\n' + fn('_bessLibrarySync') + '\n' + fn('_bessConfigPickerSync'), ctx);
  return ctx;
}

(function () {
  const lib = [
    { key: 'ORG-ACME-BIGBOX', cat: 'bess', manufacturer: 'Acme', model: 'BigBox 500', energyKwh: 500, powerKw: 250, lengthMm: 6058, widthMm: 2438, heightMm: 2896, type: 'Integrated PCS' },
    { key: 'ORG-NEXTNRG-MODEL1', cat: 'bess', manufacturer: 'NextNRG', model: 'Model 1', energyKwh: 1000, powerKw: 250, lengthMm: null, widthMm: null, type: 'DC cabinet' },
    { key: 'ORG-OLD', cat: 'bess', manufacturer: 'Old', model: 'Gone', energyKwh: 10, powerKw: 5, lengthMm: 1000, widthMm: 1000, archived: true },
    { key: 'GOTION-EDGE-760', cat: 'bess', manufacturer: 'Gotion', model: 'published seed copy', energyKwh: 760, powerKw: 380, lengthMm: 2400, widthMm: 1400 },
    { key: 'DC-X', cat: 'datacenter', manufacturer: 'Pod', model: 'P', powerKw: 1000, lengthMm: 12000, widthMm: 3000 },
    { key: 'SEED-1', cat: 'bess', manufacturer: 'S', model: 'seed', _seed: true, lengthMm: 1000, widthMm: 1000 }
  ];
  const w = world(lib);
  const units = w._bessLibraryUnits();
  ok(units.map(u => u.key).join() === 'ORG-ACME-BIGBOX,ORG-NEXTNRG-MODEL1', 'the org\'s live BESS units, sorted by name; archived, seed, compute and a published seed copy stay out: ' + units.map(u => u.key));
  const acme = units[0];
  ok(acme.sized && Math.abs(acme.lf - 19.87) < 0.02 && Math.abs(acme.wf - 8) < 0.01 && acme.name === 'Acme BigBox 500', 'feet from the datasheet\'s millimetres, named manufacturer + model');
  ok(units[1].sized === false && units[1].lf === 0, 'a unit with no footprint on file is still offered, unsized');

  const models = w._bespadModels();
  ok(models[0].id === 'GOTION-EDGE-760' && !models[0].org, 'the shipped table comes first, in its order');
  const org = models.filter(m => m.org);
  ok(org.length === 2 && org[0].id === 'ORG-ACME-BIGBOX' && !org[0].requiresDimensions && org[1].requiresDimensions === true, 'the library rides after it under its own flag; the sizeless one asks its size');

  const n = w._bessLibrarySync();
  ok(n === 2, 'two units projected into the catalog');
  const c = w.BESS_CATALOG['ORG-ACME-BIGBOX'];
  ok(c && c.org && c.kwh === 500 && c.kw === 250 && c._incPCS === true && c.model === 'Acme BigBox 500' && c.dur === 2, 'kWh, kW, integrated PCS and the name resolve by key, so a placed pad carries them');
  ok(w.BESS_CATALOG['ORG-NEXTNRG-MODEL1'].kwh === 1000 && w.BESS_CATALOG['ORG-NEXTNRG-MODEL1']._incPCS === undefined, 'a DC cabinet is not read as integrated');
  ok(w.BESS_CATALOG['GOTION-EDGE-760'].model === 'Gotion EDGE 760 kWh C&I BESS', 'a shipped entry is never overwritten');
  ok(!w.BESS_CATALOG['ORG-OLD'], 'an archived unit is not in the catalog');

  /* archived later: gone from the picker and the catalog on the next sync */
  lib[0].archived = true;
  const n2 = w._bessLibrarySync();
  ok(n2 === 1 && !w.BESS_CATALOG['ORG-ACME-BIGBOX'] && !w._bespadModels().some(m => m.id === 'ORG-ACME-BIGBOX'), 'archiving takes the unit out of the catalog and the picker');
})();

/* the pad's spec carries the key, so the electrical lookup never depends on the display name */
ok(/catalogKey:sm\?sm\.id:null/.test(fn('_padReadSpec')) && /catalogKey:sm\.id/.test(fn('_padCurrentSpec')), 'the modal and quick place put the catalog key on the spec');
ok(/requiresDimensions/.test(fn('_padReadSpec')) && /pad-lf/.test(fn('_padReadSpec')), 'a library unit with no footprint takes the typed length and width, and nothing is substituted');
ok(/m\.org\?'Your equipment library'/.test(fn('_fillPadModels')), 'the library rows sit under their own heading in the picker');
ok(/_bessLibrarySync/.test(SRC.slice(SRC.indexOf('var OmegaEq = (function(){'), SRC.indexOf('var OmegaEq = (function(){') + 9000)), 'OmegaEq.load and save run the sync');

console.log('tbesspadlibrary: ' + count + ' checks passed');
