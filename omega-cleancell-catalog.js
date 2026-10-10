/* ClearSky-OMEGA | CleanCell US reference catalog, brochure Rev H (2026-10-06).
 * Specifications only. Quotes, component costs and the supplier PDF do not
 * belong in this public repository. This extends the editor's BESS_CATALOG;
 * it does not replace tenant products, change defaults or run a sizing engine.
 * ES5 browser script; no build step. */
(function (root) {
  'use strict';
  var SOURCE = 'CleanCell US / InCharge Product Brochure, Rev H, 6 October 2026';
  var KEYS = ['CLEANCELL-CC290-125-REV-H', 'CLEANCELL-LGJP2-1000-REV-H', 'CLEANCELL-SM-1000-REV-H'];
  var COMMON = 'Planning specification, not released engineering. AC coupled; 480 VAC, three-phase, 60 Hz target; Modbus TCP over Ethernet; grid-following. Delivered AC energy, PCS compatibility, electrical/fire clearances, final drawings and warranty require confirmation. Backup, islanding and grid forming are separate scope. Equipment pricing requires an authorized quote; freight, taxes, tariffs, site works and installation are separate.';
  var PRODUCTS = [
    {
      sku: 'CC290-125', model: 'CC290/125 - 125 kW / 290 kWh class',
      kw: 125, kwh: 289.3, dur: 2.3144, usable: null,
      energyBasis: '289.3 kWh rated DC; usable/delivered AC energy not established',
      dcv: '921.6', dcMinV: 806.4, dcMaxV: 1036.8, standardDcCurrentA: 157,
      inv: 'Separate compatible 125 kW bidirectional PCS; model to confirm', ikva: null,
      dims: '1200 W x 1330 D x 2350 H mm - cabinet reference ONLY; separate PCS footprint to confirm',
      widthFt: 1200 / 304.8, depthFt: 1330 / 304.8, heightFt: 2350 / 304.8,
      dimensionsMm: { width: 1200, depth: 1330, height: 2350 },
      dimensionsStatus: 'reference-cabinet-only', weightKg: 2900, weightStatus: 'reference',
      packaging: 'One Omni 290 IP54 liquid-cooled battery cabinet PLUS separate PCS/AC equipment.',
      _incPCS: false,
      verification: '125 kW is an AC design target. Cabinet dimensions, weight and current are reference values. IEC 62619, UL 9540A unit-level testing and UN 38.3 evidence do NOT establish a UL 9540 listing for the cabinet-plus-PCS system. No BABA or non-FEOC representation.',
      productNotes: 'LFP, 314 Ah; 8 modules / 288 cells reference. Battery CAN/RS485 via gateway. Discharge -20 to +55 C; charge 0 to +55 C reference; cooling/derating to confirm. Reference door/service spaces are not approved electrical or fire clearances.',
      sourcePages: [3, 7, 12, 19],
      bomOverview: [
        { item: 'Omni 290 cabinet with battery/BMS and liquid cooling', quantity: 1, scope: 'package' },
        { item: 'Compatible 125 kW bidirectional PCS - separately placed; model/footprint pending', quantity: 1, scope: 'package' },
        { item: 'Coordinated DC protection, isolation, contactors and bus', quantity: null, scope: 'package' },
        { item: 'AC protection, metering, auxiliaries and project safety interfaces', quantity: null, scope: 'package' },
        { item: 'Controls gateway / HMI set', quantity: 1, scope: 'package' }
      ]
    },
    {
      sku: 'CC-LGJP2-1000', model: 'LG JP-2 - 1 MW / 2 MWh class (BABA-oriented; unverified)',
      kw: 1000, kwh: 2294, dur: 2.294, usable: null,
      modeledUsableKwh: 2000,
      energyBasis: '2294 kWh installed DC; 2000 kWh modeled usable ONLY, not a delivered AC guarantee',
      dcv: '', inv: 'Integrated proposed 2.5 MW class PCS at a 1 MW project limit; OEM/model to confirm', ikva: null,
      dims: '20 ft high-cube integrated container - final dimensions/weight/layout to confirm',
      widthFt: null, depthFt: null, heightFt: null, dimensionsMm: null,
      dimensionsStatus: 'pending-release', weightKg: null, weightStatus: 'pending-release',
      packaging: 'One integrated 20 ft high-cube outdoor container, including PCS; final fit to confirm.',
      _incPCS: true,
      verification: '1 MW project AC target; do not use the proposed 2.5 MW PCS class as site output. Final module/string arrangement, DC window, PCS listing, system UL 9540 approval route and fire-test evidence require confirmation. BABA/non-FEOC qualification and domestic-content percentage are UNVERIFIED; no compliance or tax-eligibility claim.',
      productNotes: 'LG JP-2 LFP platform. The 2000 kWh usable figure is a model assumption, not a guaranteed DC or AC discharge value. Final enclosure dimensions, shipping weight and lift points come from released drawings.',
      sourcePages: [4, 8, 17, 18, 19],
      bomOverview: [
        { item: 'Integrated container with battery modules, racks and BMS; module count pending', quantity: 1, scope: 'package' },
        { item: 'Proposed bidirectional PCS integrated in package; 1 MW project limit', quantity: 1, scope: 'package' },
        { item: 'Protected DC bus and string protection', quantity: null, scope: 'package' },
        { item: 'AC protection, metering and auxiliary distribution', quantity: null, scope: 'package' },
        { item: 'HVAC, fire detection and project-selected suppression', quantity: null, scope: 'package' },
        { item: 'EMS gateway / HMI set', quantity: 1, scope: 'package' }
      ]
    },
    {
      sku: 'CC-SM-1000', model: 'Smart Module - 1 MW / 2 MWh (non-BABA)',
      kw: 1000, kwh: 2000, dur: 2, usable: null,
      nominalEnergyApproximate: true,
      energyBasis: 'Approximately 2000 kWh nominal DC planning basis; usable/delivered AC energy to confirm',
      dcv: '', inv: 'Separate AC skid with proposed 2.5 MW class PCS at a 1 MW project limit; model to confirm', ikva: null,
      dims: 'Battery enclosure plus SEPARATE AC skid - both footprints/weights to confirm (20 ft enclosure assumed only)',
      widthFt: null, depthFt: null, heightFt: null, dimensionsMm: null,
      dimensionsStatus: 'pending-release', weightKg: null, weightStatus: 'pending-release',
      packaging: 'One outdoor battery enclosure PLUS one separate AC conversion skid; not an all-in-one container.',
      _incPCS: false,
      verification: '1 MW project AC target, NOT 2.5 MW. Confirm PCS model, low-load operation, DC window, module count, transformer need, enclosure/skid dimensions and approvals. No BABA, non-FEOC or domestic-content representation. Final system approval and site acceptance pending.',
      productNotes: 'CleanCell Smart Module LFP platform. The approximately 2 MWh value is nominal DC, not usable AC. HVAC, environmental monitoring and multi-zone detection with project-selected suppression.',
      sourcePages: [5, 9, 12, 19],
      bomOverview: [
        { item: 'Outdoor battery enclosure, Smart Module racks and master BMS; module count pending', quantity: 1, scope: 'package' },
        { item: 'SEPARATE AC conversion skid with proposed PCS; 1 MW project limit', quantity: 1, scope: 'package' },
        { item: 'DC isolation, contactors, precharge and current monitoring', quantity: null, scope: 'package' },
        { item: 'Skid AC protection, metering and auxiliaries', quantity: null, scope: 'package' },
        { item: 'HVAC, environmental monitoring, multi-zone detection and selected suppression', quantity: null, scope: 'package' },
        { item: 'EMS gateway / HMI set', quantity: 1, scope: 'package' }
      ]
    }
  ];

  function copy(value) { return JSON.parse(JSON.stringify(value)); }
  function entries() {
    var out = {};
    for (var i = 0; i < KEYS.length; i++) {
      var p = copy(PRODUCTS[i]);
      p.mfr = 'CleanCell US'; p.chem = 'LFP'; p._cleanCellRevH = true;
      p._incXfmr = false; p._incDisco = false;
      p.xfmr = 'Site-specific; not established as integrated';
      p.disco = 'Package AC protection; external disconnect requirements per site EOR';
      p.acVoltage = 480; p.acPhases = 3; p.acFrequencyHz = 60;
      p.acPowerStatus = 'project-design-target'; p.durationBasis = 'DC-nameplate-ratio-not-delivered-AC';
      p.source = SOURCE; p.sourceRevision = 'H'; p.sourceDate = '2026-10-06';
      p.catalogStatus = 'planning-verify'; p.pricingStatus = 'quote-required';
      p.notes = p.energyBasis + '. ' + p.packaging + ' ' + p.productNotes + ' ' + p.verification + ' ' + COMMON;
      out[KEYS[i]] = p;
    }
    return out;
  }

  /* Stable, revisioned keys preserve saved plans. Never overwrite a shipped
   * or tenant-owned entry, and never make a reference product a tenant default. */
  function mergeInto(catalog) {
    var added = [], refs = entries();
    if (!catalog || typeof catalog !== 'object') return added;
    for (var i = 0; i < KEYS.length; i++) {
      var k = KEYS[i];
      if (!Object.prototype.hasOwnProperty.call(catalog, k)) catalog[k] = refs[k];
      if (catalog[k] && catalog[k]._cleanCellRevH === true) added.push(k);
    }
    return added;
  }

  function install(catalog, doc) {
    var keys = mergeInto(catalog);
    if (!doc || !keys.length) return keys;
    var sel = doc.getElementById('bm-catalog');
    if (!sel) return keys;
    var group = doc.getElementById('bm-cat-cleancell-revh');
    if (!group) {
      group = doc.createElement('optgroup');
      group.id = 'bm-cat-cleancell-revh';
      group.label = 'CleanCell US - Rev H (planning specifications)';
      sel.appendChild(group);
    }
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i], p = catalog[key], optionId = 'bm-ref-' + key;
      if (doc.getElementById(optionId)) continue;
      var option = doc.createElement('option');
      option.id = optionId; option.value = key;
      option.textContent = p.model + ' | ' + p.kw + ' kW AC / ' + (p.nominalEnergyApproximate ? '~' : '') + p.kwh + ' kWh DC';
      group.appendChild(option);
    }
    var panel = doc.getElementById('bm-cleancell-revh-details');
    if (!panel) {
      panel = doc.createElement('div'); panel.id = 'bm-cleancell-revh-details';
      panel.hidden = true; panel.setAttribute('role', 'note');
      panel.style.cssText = 'margin:10px 0;padding:10px;border:1px solid currentColor;border-radius:6px;font-size:12px;line-height:1.5;white-space:pre-line;overflow-wrap:anywhere;max-width:100%;box-sizing:border-box;';
      var anchor = doc.getElementById('bm-catalog-preview') || sel;
      if (anchor.parentNode) anchor.parentNode.insertBefore(panel, anchor.nextSibling);
    }
    function refresh() {
      var p = catalog[sel.value];
      if (!p || p._cleanCellRevH !== true) { panel.hidden = true; return; }
      var bom = [];
      for (var j = 0; j < p.bomOverview.length; j++) {
        var row = p.bomOverview[j];
        bom.push((row.quantity == null ? 'Quantity to confirm: ' : row.quantity + ' x ') + row.item);
      }
      panel.textContent = 'CLEANCELL - PLANNING SPECIFICATIONS / VERIFY BEFORE RELEASE\n'
        + p.kw + ' kW AC project target. ' + p.energyBasis + '.\n'
        + 'Layout: ' + p.packaging + '\nReference dimensions: ' + p.dims + '\n'
        + 'Unknown dimensions remain unknown: a generic editor symbol is NOT a verified installation footprint.\n'
        + 'Functional package BOM (not a released parts list):\n' + bom.join('\n') + '\n'
        + p.verification + '\n' + COMMON + '\n'
        + 'Source: ' + SOURCE + ', pages ' + p.sourcePages.join(', ') + '.';
      panel.hidden = false;
    }
    if (!sel._omegaCleanCellRevHBound) {
      sel.addEventListener('change', refresh);
      sel.addEventListener('focus', refresh);
      sel._omegaCleanCellRevHBound = true;
    }
    refresh();
    return keys;
  }

  var api = { entries: entries, mergeInto: mergeInto, install: install, revision: 'H' };
  root.OmegaCleanCellCatalog = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;

  function boot() {
    /* BESS_CATALOG is a top-level lexical binding in editor.html, not
     * necessarily a window property. Waiting for DOM readiness avoids its TDZ. */
    var catalog = null;
    try { if (typeof BESS_CATALOG !== 'undefined') catalog = BESS_CATALOG; } catch (e) {}
    if (!catalog) catalog = root.BESS_CATALOG;
    if (catalog) install(catalog, root.document);
  }
  if (root.document) {
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})(typeof window !== 'undefined' ? window : this);
