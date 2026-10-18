/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 *
 * omega-editor-v2-guided.js — a guided build becomes the design model.
 *
 * BESS, DCFC, Level 2, PV and compute builds in Site Map place equipment,
 * a trench and the ratings. This module writes that same result onto an
 * editor-v2 document. The permit set and the single-line are rebuilt from
 * the document, so the drawings follow the build.
 *
 * There is no second dialog. The build is data. The sheets are the drawing.
 */
(function (root) {
  'use strict';

  var D = root.OmegaEditorV2Doc || require('./omega-editor-v2-doc.js');

  /* Phrases the old permit set printed, and that a guided build's sheets
     must still print. A gap is a thing the old set drew that this set
     does not, with the reason, so it cannot disappear into a silent miss. */
  var PHRASES = [
    { id: 'general-notes', phrase: 'All construction shall comply with the codes adopted by the AHJ' },
    { id: 'electrical-706', phrase: 'clearly marked per NEC 706', kinds: ['bess'] },
    { id: 'scope-bess', phrase: 'The project is to install a new Battery Energy Storage System', kinds: ['bess'] },
    { id: 'scope-dcfc', phrase: 'The project is to install DC fast chargers', kinds: ['dcfc'] },
    { id: 'scope-l2', phrase: 'The project is to install Level 2 chargers', kinds: ['l2'] },
    { id: 'scope-pv', phrase: 'The project is to install a photovoltaic array', kinds: ['pv'] },
    { id: 'site-apn', phrase: 'APN: ' },
    { id: 'site-utility', phrase: 'Serving utility: ' },
    { id: 'site-voltage', phrase: 'System voltage: ' },
    { id: 'site-lat', phrase: 'Lat / Long: ' },
    { id: 'site-zoning', phrase: 'Zoning district: ' },
    { id: 'site-flood', phrase: 'Flood zone: ' },
    { id: 'title-job', phrase: 'JOB NO.: ' },
    { id: 'title-designed', phrase: 'DESIGNED BY: ' },
    { id: 'title-checked', phrase: 'CHECKED BY: ' },
    { id: 'title-seal', phrase: 'ENGINEER OF RECORD' },
    { id: 'title-blank-seal', phrase: 'SEAL' },
    { id: 'true-north', phrase: 'TRUE NORTH' },
    { id: 'scale', phrase: '1 in = ' },
    { id: 'exposure', phrase: '10 ft exposure check', kinds: ['bess'] },
    { id: 'field-verify', phrase: 'Field-verify all routing and lengths before ordering.' },
    { id: 'risers', phrase: 'Add vertical risers, equipment stub-ups, pull-box slack and terminations before ordering.' },
    { id: 'trench-once', phrase: 'Trench corridors shared by multiple services are counted once.' },
    { id: 'article-300', phrase: 'NEC Article 300' },
    { id: 'from-to', phrase: 'From' },
    { id: 'egc', phrase: '250.122' },
    { id: 'sign-ess', phrase: 'EMERGENCY SHUTOFF', kinds: ['bess'] },
    { id: 'sign-smoke', phrase: 'NO SMOKING', kinds: ['bess'] },
    { id: 'sign-pv', phrase: 'PV SYSTEM DISCONNECT', kinds: ['pv'] },
    { id: 'sign-evse', phrase: 'EVSE NAMEPLATE', kinds: ['dcfc', 'l2'] },
    { id: 'pad-not-structural', phrase: 'A structural pad section is not designed in this set.' },
    { id: 'fence-not-structural', phrase: 'not designed in this set.', kinds: ['bess'] },
    { id: 'demo-sheet', phrase: 'Demolition is sheet C-002', kinds: ['bess'] },
    { id: 'no-empty-demo', phrase: 'An empty demolition sheet is not issued.', kinds: ['pv', 'dcfc', 'l2'] }
  ];

  var GAPS = [
    { id: 'satellite', detail: 'The old plot plan could lay a satellite photo or a frozen map under E1.0. This set has no image to register, so the plan is linework at a stated scale.' },
    { id: 'sign-artwork', detail: 'The old signage sheets drew colored rectangles. This set prints the legend and the section. It does not redraw the colored face.' },
    { id: 'structural-pad', detail: 'S1.1 and S1.2 were structural pad and gear-pad details. Footprints are printed. A foundation section is not designed.' },
    { id: 'racking-section', detail: 'S1.3, S1.4 and S1.5 were racking sections. The array sheet states the mount, the module and the table count. It is not a structural section.' },
    { id: 'fence-section', detail: 'S3.0 was a fencing detail. A drawn fence is noted. Post, fabric and foundation are not designed.' },
    { id: 'electrode', detail: 'The grounding electrode (rod count, resistance, bonding jumper) is not designed. Table 250.122 equipment grounding conductors are.' },
    { id: 'conduit-fill', detail: 'Chapter 9 fill is not calculated. The old schedule also left fill to the engineer when the raceway trade size was unknown. Trade size stays blank until the run carries one.' },
    { id: 'flood-default', detail: 'The old cover defaulted the flood zone to X. This set prints the zone only when the project names it, and otherwise says it is not on the project.' },
    { id: 'manufacturer-default', detail: 'The old cover once prefilled a battery manufacturer. A maker or model is printed only when the build or the equipment carries it.' },
    { id: 'listing-claim', detail: 'The old cover printed UL 9540 / UL 1741 as the certification cell even when the unit was not identified. This set does not claim a listing the equipment record does not state.' },
    { id: 'pptx', detail: 'The old plot-plan dialog could export a PowerPoint. This set exports PDF and DXF.' },
    { id: 'ai-notes', detail: 'The old cover could append notes written by a model. These notes are the standard cover language plus the drawing. Nothing is generated by a model.' },
    { id: 'manual-sld', detail: 'The old one-line could be dragged by hand after generation. This diagram is regenerated from the design model. It is not a second editor.' },
    { id: 'mv-relay', detail: 'Medium-voltage relay, AIC and a utility reclose scheme are printed only when the project carries them. They are not filled from a template.' },
    { id: 'ada-stall', detail: 'An accessible EV stall is not marked unless the build marks one. The old EV sign set drew that face by default.' },
    { id: 'existing-survey', detail: 'Demolition lists only what the build marked. The old sheet could also show a map of existing conditions. That survey is not invented.' }
  ];

  function apply(doc, build) {
    build = build || {};
    var base = doc ? D.clone(doc) : D.create({});
    base.entities = (base.entities || []).filter(function (e) { return !e || e.source !== 'guided'; });
    if (build.name) base.name = build.name;
    if (build.address) base.address = build.address;
    if (build.customer) {
      base.assignment = D.clone(base.assignment || {});
      base.assignment.customerName = build.customer;
    }
    if (build.anchor) base.anchor = { lat: build.anchor.lat, lng: build.anchor.lng };
    base.electrical = D.clone(build.electrical || base.electrical || {});
    base.drawing = D.clone(build.drawing || base.drawing || {});
    base.guided = { kind: build.kind || '', source: 'guided' };

    function add(e) {
      e.source = 'guided';
      e.id = e.id || D.uid('e');
      e.layer = e.layer || 'equipment';
      base.entities.push(e);
    }
    if (build.parcel && build.parcel.length) {
      add({ type: 'polygon', layer: 'site', closed: true, pts: build.parcel });
    }
    (build.equipment || []).forEach(function (eq) {
      add({
        type: 'equip', layer: 'equipment', key: eq.key, label: eq.label || eq.key,
        x: eq.x, y: eq.y, w: eq.w, h: eq.h, rot: eq.rot || 0,
        kw: eq.kw || 0, kwh: eq.kwh || 0, level: eq.level || '',
        mfr: eq.mfr || '', model: eq.model || '',
        zPct: eq.zPct || 0, config: eq.config || '',
        secondaryV: eq.secondaryV || 0, sku: eq.sku || '', datasheet: eq.datasheet || ''
      });
    });
    (build.conduits || []).forEach(function (c) {
      add({ type: 'conduit', layer: 'conduit', spec: c.spec || '', from: c.from || '', to: c.to || '', tradeSize: c.tradeSize || '', pts: c.pts || [] });
    });
    if (build.trench && build.trench.pts) add({ type: 'trench', layer: 'conduit', pts: build.trench.pts });
    if (build.fence && build.fence.pts) add({ type: 'fence', layer: 'site', pts: build.fence.pts, closed: true });
    (build.notes || []).forEach(function (n) {
      add({ type: 'text', layer: 'annotation', x: n.x || 0, y: n.y || 0, text: n.text || '', h: 2 });
    });
    (build.demo || []).forEach(function (n) {
      add({ type: 'demo', layer: 'site', label: n.label || 'Existing item', pts: n.pts || [] });
    });
    if (build.array && build.array.boundaryId !== false) {
      var boundary = null, i;
      for (i = 0; i < base.entities.length; i++) if (base.entities[i].type === 'polygon') boundary = base.entities[i];
      if (boundary) {
        add({
          type: 'array', layer: 'array', boundaryId: boundary.id,
          mount: build.array.mount || 'fixed-ground', setbackFt: build.array.setbackFt || 10,
          invKw: build.array.invKw || 0
        });
      }
    }
    return base;
  }

  function examples() {
    function bess() {
      return {
        kind: 'bess',
        name: 'Guided 1 MW BESS',
        address: '100 Storage Road',
        customer: 'Guided Storage LLC',
        anchor: { lat: 33.45, lng: -112.07 },
        electrical: {
          voltage: 480, phases: 3, pf: 0.95, method: 'supply',
          ahj: 'Reference AHJ', jurisdiction: 'Reference County',
          utility: 'Reference Electric', zoning: 'I-2', apn: '123-45-678', necEdition: '2023'
        },
        drawing: { jobNo: 'G-100', designedBy: 'A. Designer', checkedBy: 'B. Checker', rev: '0' },
        parcel: [{ x: 0, y: 0 }, { x: 220, y: 0 }, { x: 220, y: 160 }, { x: 0, y: 160 }],
        equipment: [
          { key: 'poi', label: 'POI', x: 30, y: 30, w: 4, h: 4 },
          { key: 'meter', label: 'Meter', x: 48, y: 30, w: 3, h: 2 },
          { key: 'transformer', label: 'Transformer', x: 70, y: 40, w: 10, h: 8, zPct: 5.75, config: 'Dyn11' },
          { key: 'pcs', label: 'PCS', x: 100, y: 70, w: 8, h: 4, kw: 1000, mfr: 'Reference Power', model: 'RP-1000' },
          { key: 'bess', label: 'BESS', x: 130, y: 80, w: 40, h: 8, kw: 1000, kwh: 4000, mfr: 'Reference Cells', model: 'RC-4000' }
        ],
        conduits: [{ spec: 'PVC', from: 'BESS-1', to: 'XFMR-1', pts: [{ x: 30, y: 30 }, { x: 130, y: 30 }, { x: 130, y: 80 }] }],
        trench: { pts: [{ x: 30, y: 28 }, { x: 130, y: 28 }, { x: 130, y: 78 }] },
        fence: { pts: [{ x: 10, y: 10 }, { x: 200, y: 10 }, { x: 200, y: 140 }, { x: 10, y: 140 }] },
        notes: [{ text: 'Gate', x: 20, y: 12 }, { text: 'Fire access along the south drive', x: 20, y: 20 }],
        demo: [{ label: 'Existing shed' }]
      };
    }
    function dcfc() {
      return {
        kind: 'dcfc',
        name: 'Guided DCFC',
        address: '300 Charger Road',
        customer: 'Guided Charging LLC',
        anchor: { lat: 33.5, lng: -112.1 },
        electrical: { voltage: 480, phases: 3, pf: 1, ahj: 'Reference AHJ', utility: 'Reference Electric', apn: '300-1' },
        drawing: { jobNo: 'G-300', designedBy: 'A. Designer', checkedBy: 'B. Checker' },
        parcel: [{ x: 0, y: 0 }, { x: 180, y: 0 }, { x: 180, y: 100 }, { x: 0, y: 100 }],
        equipment: [
          { key: 'poi', label: 'POI', x: 20, y: 20, w: 4, h: 4 },
          { key: 'meter', label: 'Meter', x: 36, y: 20, w: 3, h: 2 },
          { key: 'transformer', label: 'Transformer', x: 60, y: 30, w: 8, h: 6, zPct: 5.5, config: 'Dyn11' },
          { key: 'charger', label: 'DCFC', level: 'dcfc', x: 40, y: 70, w: 3, h: 8, kw: 150 },
          { key: 'charger', label: 'DCFC', level: 'dcfc', x: 68, y: 70, w: 3, h: 8, kw: 150 },
          { key: 'charger', label: 'DCFC', level: 'dcfc', x: 96, y: 70, w: 3, h: 8, kw: 150 },
          { key: 'charger', label: 'DCFC', level: 'dcfc', x: 124, y: 70, w: 3, h: 8, kw: 150 }
        ],
        conduits: [{ spec: 'RMC', from: 'XFMR-1', to: 'EV-1', pts: [{ x: 20, y: 20 }, { x: 124, y: 20 }, { x: 124, y: 70 }] }]
      };
    }
    function l2() {
      return {
        kind: 'l2',
        name: 'Guided Level 2',
        address: '12 Stall Lane',
        customer: 'Guided Charging LLC',
        electrical: { voltage: 480, phases: 3, pf: 1, ahj: 'Reference AHJ' },
        drawing: { jobNo: 'G-12' },
        equipment: [
          { key: 'transformer', label: 'Transformer', x: 10, y: 10, w: 6, h: 6, secondaryV: 240, zPct: 5.75 },
          { key: 'charger', label: 'Level 2', level: 'l2', x: 30, y: 10, w: 2, h: 2, kw: 7.2 }
        ],
        conduits: [{ spec: 'PVC', from: 'XFMR-1', to: 'EV-1', pts: [{ x: 10, y: 10 }, { x: 30, y: 10 }] }]
      };
    }
    function pv() {
      return {
        kind: 'pv',
        name: 'Guided commercial PV',
        address: '200 Array Avenue',
        customer: 'Guided Solar LLC',
        electrical: { voltage: 480, phases: 3, pf: 0.95, method: 'auto', busA: 800, mainA: 400, ahj: 'Reference AHJ', utility: 'Reference Electric' },
        drawing: { jobNo: 'G-200' },
        parcel: [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 120 }, { x: 0, y: 120 }],
        array: { mount: 'fixed-ground', setbackFt: 10 },
        equipment: [
          { key: 'poi', label: 'POI', x: 16, y: 16, w: 4, h: 4 },
          { key: 'meter', label: 'Meter', x: 28, y: 16, w: 3, h: 2 }
        ],
        conduits: [{ spec: 'RMC', from: 'POI', to: 'M', pts: [{ x: 16, y: 16 }, { x: 16, y: 60 }] }]
      };
    }
    return { bess: bess, dcfc: dcfc, l2: l2, pv: pv };
  }

  function applies(kind, item) {
    if (!item.kinds) return true;
    var i;
    for (i = 0; i < item.kinds.length; i++) if (item.kinds[i] === kind) return true;
    return false;
  }

  function coverage(kind, text) {
    var present = [], missing = [], i, item;
    for (i = 0; i < PHRASES.length; i++) {
      item = PHRASES[i];
      if (!applies(kind, item)) continue;
      if (String(text).indexOf(item.phrase) >= 0) present.push(item.id);
      else missing.push(item.id);
    }
    return { present: present, missing: missing };
  }

  var api = {
    apply: apply,
    examples: examples(),
    phrases: PHRASES,
    gaps: GAPS,
    coverage: coverage,
    VERSION: 'editor-v2-guided/1'
  };
  root.OmegaEditorV2Guided = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : global);
