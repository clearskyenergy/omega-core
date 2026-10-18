/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 *
 * omega-editor-v2-electrical.js — topology, NEC sizing and design checks
 * for a Site Plan. Pure. No DOM.
 *
 * The permit set and the single-line both read this model, so a change on
 * the drawing changes both. Numbers cite the section they come from.
 * Where the drawing does not carry a fact, the field stays blank and a
 * check says so. Nothing here invents a code requirement.
 *
 * Ampacity is the 75°C copper column of NEC 2023 Table 310.16. The 75°C
 * column is used because 110.14(C) limits the termination unless the
 * equipment is marked otherwise. Ambient correction and bundling
 * adjustment (310.15) are applied only when the drawing names them.
 *
 * This is not the IEC cable engine in api/_lib/bess-design-engine.js.
 * That engine sizes millimetre cables for the battery workbook. A US
 * permit set cannot share those tables. Site Map's Run is still inside
 * editor.html; this file is the module a later port of Run should call.
 */
(function (root) {
  'use strict';

  var G = root.OmegaEditorV2Geom || (typeof require === 'function' ? require('./omega-editor-v2-geom.js') : null);
  var D = root.OmegaEditorV2Doc || (typeof require === 'function' ? require('./omega-editor-v2-doc.js') : null);

  var SQRT3 = 1.7320508075688772;
  var K_CU = 12.9;

  /* NEC 2023 240.6(A) standard ampere ratings. */
  var OCPD = [15, 20, 25, 30, 35, 40, 45, 50, 60, 70, 80, 90, 100, 110, 125, 150, 175, 200, 225, 250, 300, 350, 400, 450, 500, 600, 700, 800, 1000, 1200, 1600, 2000, 2500, 3000, 4000, 5000, 6000];

  /* 75°C copper, Table 310.16. small = 240.4(D) limit. parallel = 310.10(G) allows it (1/0 and larger).
     cm = Chapter 9, Table 8, uncoated copper, for the voltage-drop note. */
  var CU = [
    { awg: '14', amp: 20, cm: 4110, small: 15 },
    { awg: '12', amp: 25, cm: 6530, small: 20 },
    { awg: '10', amp: 35, cm: 10380, small: 30 },
    { awg: '8', amp: 50, cm: 16510 },
    { awg: '6', amp: 65, cm: 26240 },
    { awg: '4', amp: 85, cm: 41740 },
    { awg: '3', amp: 100, cm: 52620 },
    { awg: '2', amp: 115, cm: 66360 },
    { awg: '1', amp: 130, cm: 83690 },
    { awg: '1/0', amp: 150, cm: 105600, parallel: true },
    { awg: '2/0', amp: 175, cm: 133100, parallel: true },
    { awg: '3/0', amp: 200, cm: 167800, parallel: true },
    { awg: '4/0', amp: 230, cm: 211600, parallel: true },
    { awg: '250', amp: 255, cm: 250000, parallel: true },
    { awg: '300', amp: 285, cm: 300000, parallel: true },
    { awg: '350', amp: 310, cm: 350000, parallel: true },
    { awg: '400', amp: 335, cm: 400000, parallel: true },
    { awg: '500', amp: 380, cm: 500000, parallel: true },
    { awg: '600', amp: 420, cm: 600000, parallel: true },
    { awg: '700', amp: 460, cm: 700000, parallel: true },
    { awg: '750', amp: 475, cm: 750000, parallel: true },
    { awg: '800', amp: 490, cm: 800000, parallel: true },
    { awg: '900', amp: 520, cm: 900000, parallel: true },
    { awg: '1000', amp: 545, cm: 1000000, parallel: true },
    { awg: '1250', amp: 590, cm: 1250000, parallel: true },
    { awg: '1500', amp: 625, cm: 1500000, parallel: true },
    { awg: '1750', amp: 650, cm: 1750000, parallel: true },
    { awg: '2000', amp: 665, cm: 2000000, parallel: true }
  ];

  /* Table 250.122 copper. The row is the smallest "not exceeding" rating that still covers the device. */
  var EGC = [
    [15, '14'], [20, '12'], [60, '10'], [100, '8'], [200, '6'], [300, '4'], [400, '3'],
    [500, '2'], [600, '1'], [800, '1/0'], [1000, '2/0'], [1200, '3/0'], [1600, '4/0'],
    [2000, '250'], [2500, '350'], [3000, '400'], [4000, '500'], [5000, '700'], [6000, '800']
  ];

  /* Preferred transformer nameplates. Not an NEC table. NEC 450 does not set a kVA multiplier. */
  var KVA = [15, 30, 45, 75, 112.5, 150, 225, 300, 500, 750, 1000, 1500, 2000, 2500, 3000, 3750, 5000, 7500, 10000];

  /* 75°C ambient correction, Table 310.15(B)(1), 30°C base. Applied only when ambient is named. */
  var AMBIENT = [
    { max: 10, f: 1.20 }, { max: 15, f: 1.15 }, { max: 20, f: 1.11 }, { max: 25, f: 1.05 },
    { max: 30, f: 1.00 }, { max: 35, f: 0.94 }, { max: 40, f: 0.88 }, { max: 45, f: 0.82 },
    { max: 50, f: 0.75 }, { max: 55, f: 0.67 }, { max: 60, f: 0.58 }, { max: 65, f: 0.47 },
    { max: 70, f: 0.33 }
  ];

  function r1(n) { return Math.round(n * 10) / 10; }
  function num(v) { var n = +v; return isFinite(n) ? n : 0; }

  function nextUp(table, a) {
    var i;
    for (i = 0; i < table.length; i++) if (table[i] >= a - 1e-6) return table[i];
    return null;
  }
  function isStandard(a) {
    var i;
    for (i = 0; i < OCPD.length; i++) if (Math.abs(OCPD[i] - a) < 1e-6) return true;
    return false;
  }
  function usableAmp(c) { return c.small ? Math.min(c.amp, c.small) : c.amp; }

  function ambientFactor(c) {
    var i;
    if (c == null || c === '' || !isFinite(+c)) return null;
    for (i = 0; i < AMBIENT.length; i++) if (+c <= AMBIENT[i].max) return AMBIENT[i].f;
    return null;
  }

  function lineCurrent(kw, volts, phases, pf) {
    if (!(kw > 0) || !(volts > 0) || !(pf > 0)) return 0;
    var w = kw * 1000;
    if (phases === 1) return w / (volts * pf);
    return w / (volts * pf * SQRT3);
  }

  function egcOf(ocpdA) {
    var i;
    for (i = 0; i < EGC.length; i++) if (ocpdA <= EGC[i][0]) return EGC[i][1];
    return null;
  }

  function conductorSpec(c, sets) {
    var n = +c.awg;
    var size = (isFinite(n) && n >= 250) ? c.awg + ' kcmil' : c.awg + ' AWG';
    if (sets > 1) return sets + ' sets of ' + size + ' Cu';
    return size + ' Cu';
  }

  /**
   * Size a continuous circuit.
   * designA is already 125% of the continuous current where the section requires it.
   * Returns null when the current is not positive, or { error } when no standard device reaches it.
   */
  function sizeContinuous(designA) {
    var sets, i, c, need, pick, ocpd, total, bigger, usable;
    if (!(designA > 0)) return null;
    for (sets = 1; sets <= 12; sets++) {
      need = designA / sets;
      pick = null;
      for (i = 0; i < CU.length; i++) {
        c = CU[i];
        if (sets > 1 && !c.parallel) continue;
        if (usableAmp(c) + 1e-9 >= need) { pick = c; break; }
      }
      if (!pick) continue;
      ocpd = nextUp(OCPD, designA);
      if (ocpd == null) return { error: 'The required device is above 6000 A, the largest standard rating in 240.6(A) used here.' };
      total = usableAmp(pick) * sets;
      if (ocpd <= total + 1e-9) {
        return pack(pick, sets, ocpd, total, false);
      }
      if (ocpd <= 800 && !isStandard(total)) {
        var nxt = nextUp(OCPD, total + 0.1);
        if (nxt === ocpd) return pack(pick, sets, ocpd, total, true);
      }
      bigger = null;
      for (i = 0; i < CU.length; i++) {
        c = CU[i];
        if (sets > 1 && !c.parallel) continue;
        usable = usableAmp(c) * sets;
        if (usable + 1e-9 >= ocpd) { bigger = c; break; }
      }
      if (bigger) return pack(bigger, sets, ocpd, usableAmp(bigger) * sets, false);
    }
    return { error: 'No copper size in Table 310.16, paralleled up to 12 sets, carries this current.' };
  }

  function pack(c, sets, ocpd, ampacity, nextHigher) {
    return {
      awg: c.awg,
      sets: sets,
      cm: c.cm * sets,
      cmEach: c.cm,
      ampacity: ampacity,
      ocpdA: ocpd,
      spec: conductorSpec(c, sets),
      nextHigher: !!nextHigher,
      egc: egcOf(ocpd)
    };
  }

  function voltageDrop(currentA, lengthFt, cm, volts, phases) {
    if (!(currentA > 0) || !(lengthFt > 0) || !(cm > 0) || !(volts > 0)) return null;
    var factor = phases === 1 ? 2 : SQRT3;
    var vd = factor * K_CU * currentA * lengthFt / cm;
    return { volts: r1(vd), pct: Math.round(vd / volts * 1000) / 10 };
  }

  function ringDist(a, b) {
    var i, j, best = Infinity, d;
    if (!a || !b || a.length < 2 || b.length < 2) return null;
    if (a.length >= 3 && b.length >= 3 && (G.pointInPoly(a[0], b) || G.pointInPoly(b[0], a))) return 0;
    for (i = 0; i < a.length; i++) {
      for (j = 0; j < b.length; j++) {
        d = G.closestOnSegment(b[j], a[i], a[(i + 1) % a.length]).dist;
        if (d < best) best = d;
        d = G.closestOnSegment(a[i], b[j], b[(j + 1) % b.length]).dist;
        if (d < best) best = d;
      }
    }
    return best;
  }

  function equipRing(e) {
    return G.rectCorners(e);
  }

  function assumptions(doc) {
    var e = (doc && doc.electrical) || {};
    var voltage = num(e.voltage);
    var phases = e.phases === 1 ? 1 : (e.phases === 3 ? 3 : 0);
    var pf = num(e.pf);
    return {
      voltage: voltage > 0 ? voltage : 480,
      voltageAssumed: !(voltage > 0),
      phases: phases || 3,
      phasesAssumed: !phases,
      pf: pf > 0 && pf <= 1 ? pf : 0.95,
      pfAssumed: !(pf > 0 && pf <= 1),
      nec: e.necEdition ? String(e.necEdition) : '2023',
      adoptedNec: e.adoptedNec ? String(e.adoptedNec) : '',
      ahj: e.ahj ? String(e.ahj) : '',
      jurisdiction: e.jurisdiction ? String(e.jurisdiction) : '',
      ifcEdition: e.ifcEdition ? String(e.ifcEdition) : '',
      busA: num(e.busA),
      mainA: num(e.mainA),
      method: e.method === '120' || e.method === '100' || e.method === 'supply' ? e.method : 'auto',
      ambientC: e.ambientC == null || e.ambientC === '' ? null : num(e.ambientC),
      engineer: e.engineer ? String(e.engineer) : '',
      apn: textOf(e.apn || drawingOf(doc).apn),
      utility: textOf(e.utility),
      zoning: textOf(e.zoning),
      flood: textOf(e.flood),
      jobNo: textOf(drawingOf(doc).jobNo || e.jobNo),
      designedBy: textOf(drawingOf(doc).designedBy || e.designedBy),
      checkedBy: textOf(drawingOf(doc).checkedBy || e.checkedBy),
      revNote: textOf(drawingOf(doc).rev || e.rev) || '0',
      kind: (doc && doc.guided && doc.guided.kind) ? String(doc.guided.kind) : ''
    };
  }
  function drawingOf(doc) { return (doc && doc.drawing) || {}; }
  function textOf(v) { return v == null ? '' : String(v); }

  function tag(prefix, n) { return prefix + '-' + n; }

  function analyze(doc, catalog) {
    doc = doc || { entities: [] };
    catalog = catalog || {};
    var a = assumptions(doc);
    var amb = ambientFactor(a.ambientC);
    var entities = doc.entities || [];
    var i, e, lay;
    var checks = [];
    var equipment = [];
    var bess = [], pcs = [], arrays = [], chargers = [], xfmrs = [], meters = [], pois = [], computes = [];
    var conduits = [], trenches = [], fences = [], setbacks = [], parcels = [], buildings = [];
    var nB = 0, nP = 0, nC = 0, nX = 0, nA = 0, nK = 0;

    function addCheck(id, ok, severity, cite, title, detail) {
      checks.push({ id: id, ok: !!ok, severity: severity, cite: cite, title: title, detail: detail });
    }

    for (i = 0; i < entities.length; i++) {
      e = entities[i];
      if (!e) continue;
      if (e.type === 'equip' && e.key === 'bess') {
        nB++;
        bess.push(equipRecord(e, tag('BESS', nB), 'BESS'));
      } else if (e.type === 'equip' && e.key === 'pcs') {
        nP++;
        pcs.push(equipRecord(e, tag('PCS', nP), 'PCS'));
      } else if (e.type === 'equip' && e.key === 'transformer') {
        nX++;
        xfmrs.push(equipRecord(e, tag('XFMR', nX), 'Transformer'));
      } else if (e.type === 'equip' && e.key === 'meter') {
        meters.push(equipRecord(e, meters.length ? tag('M', meters.length + 1) : 'M', 'Meter'));
      } else if (e.type === 'equip' && e.key === 'poi') {
        pois.push(equipRecord(e, pois.length ? tag('POI', pois.length + 1) : 'POI', 'Point of interconnection'));
      } else if (e.type === 'equip' && e.key === 'charger') {
        nC++;
        chargers.push(equipRecord(e, tag('EV', nC), 'EV charger'));
      } else if (e.type === 'equip' && (e.key === 'compute' || e.key === 'load')) {
        nK++;
        computes.push(equipRecord(e, tag('LOAD', nK), e.key === 'compute' ? 'Compute' : 'Load'));
      } else if (e.type === 'array') {
        lay = D.arrayLayout(doc, e);
        nA++;
        arrays.push({
          id: e.id, tag: tag('PV', nA), kind: 'pv',
          kwDc: lay && lay.ok ? lay.kw : 0,
          kwAc: e.invKw > 0 ? num(e.invKw) : (lay && lay.ok ? lay.kwAc : 0),
          kwAcFrom: e.invKw > 0 ? 'nameplate' : 'layout',
          tables: lay && lay.ok ? lay.tableCount : 0,
          modules: lay && lay.ok ? lay.moduleCount : 0,
          mount: e.mount || 'fixed-ground',
          isc: num(e.isc), voc: num(e.voc), vmp: num(e.vmp),
          modulesPerString: num(e.modulesPerString),
          layoutOk: !!(lay && lay.ok),
          x: e.x, y: e.y
        });
      } else if (e.type === 'conduit' && e.pts) {
        conduits.push({
          id: e.id, tag: 'C' + (conduits.length + 1),
          lengthFt: r1(G.polylineLength(e.pts)),
          spec: e.spec || '',
          trade: e.tradeSize || '',
          from: e.from || e.runFrom || '',
          to: e.to || e.runTo || '',
          pts: e.pts
        });
      } else if (e.type === 'trench' && e.pts) {
        trenches.push({
          id: e.id, tag: 'T' + (trenches.length + 1),
          lengthFt: r1(G.polylineLength(e.pts)),
          pts: e.pts
        });
      } else if (e.type === 'fence') fences.push(e);
      else if (e.type === 'setback') setbacks.push(e);
      else if (e.type === 'polygon' || (e.type === 'polyline' && e.closed)) parcels.push(e);
      else if (e.type === 'obstruction') buildings.push(e);
    }

    equipment = pois.concat(meters, xfmrs, pcs, bess, chargers, computes);

    var hasContent = bess.length + pcs.length + arrays.length + chargers.length + computes.length + xfmrs.length > 0;

    /* Pair each BESS with a PCS. Unpaired battery kW stands in for the inverter output and is named as such. */
    var sources = [];
    var usedPcs = {};
    for (i = 0; i < bess.length; i++) {
      var unit = bess[i];
      var mate = nearestFree(unit, pcs, usedPcs);
      var kw = mate && mate.kw > 0 ? mate.kw : unit.kw;
      var from = mate && mate.kw > 0 ? 'pcs' : (unit.kw > 0 ? 'bess' : 'none');
      sources.push({
        id: 'src-ess-' + (i + 1),
        role: 'ess',
        tag: mate ? mate.tag : unit.tag,
        endTag: unit.tag,
        label: mate ? mate.tag + ' / ' + unit.tag : unit.tag,
        kw: kw,
        kwFrom: from,
        kwh: unit.kwh,
        cite: 'NEC 2023 706.30(A), 706.31',
        limited: !!(mate && unit.kw > mate.kw + 0.1),
        batteryKw: unit.kw,
        pcsKw: mate ? mate.kw : 0
      });
    }
    for (i = 0; i < pcs.length; i++) {
      if (!usedPcs[pcs[i].tag] && pcs[i].kw > 0) {
        sources.push({
          id: 'src-pcs-' + (i + 1), role: 'ess', tag: pcs[i].tag, endTag: '',
          label: pcs[i].tag, kw: pcs[i].kw, kwFrom: 'pcs', kwh: 0,
          cite: 'NEC 2023 706.30(A), 706.31'
        });
      }
    }
    for (i = 0; i < arrays.length; i++) {
      sources.push({
        id: 'src-pv-' + (i + 1), role: 'pv', tag: tag('INV', i + 1), endTag: arrays[i].tag,
        label: tag('INV', i + 1) + ' / ' + arrays[i].tag,
        kw: arrays[i].kwAc, kwFrom: arrays[i].kwAcFrom, kwh: 0,
        kwDc: arrays[i].kwDc,
        cite: 'NEC 2023 690.8(A), 690.8(B)(1), 690.9'
      });
    }

    var loads = [];
    for (i = 0; i < chargers.length; i++) {
      var ch = chargers[i];
      var level = ch.level || (ch.kw >= 50 ? 'dcfc' : (ch.kw > 0 ? 'l2' : ''));
      loads.push({
        id: 'ld-ev-' + (i + 1), role: 'ev', level: level, tag: ch.tag, label: ch.tag,
        kw: ch.kw, cite: 'NEC 2023 625.41'
      });
    }
    for (i = 0; i < computes.length; i++) {
      loads.push({
        id: 'ld-k-' + (i + 1), role: 'compute', level: '', tag: computes[i].tag,
        label: computes[i].tag, kw: computes[i].kw,
        cite: 'NEC 2023 215.2(A)(1), 215.3'
      });
    }

    var factorNote = amb == null
      ? 'Table 310.16, 75°C copper, 30°C ambient, not more than three current-carrying conductors. 310.15 adjustment is not applied: ambient and raceway fill are not both known.'
      : 'Table 310.16, 75°C copper, corrected for ' + a.ambientC + '°C ambient by Table 310.15(B)(1) factor ' + amb + '. Bundling adjustment is not applied.';

    var circuits = [];
    function pushCircuit(item, kind) {
      if (!(item.kw > 0)) {
        circuits.push({
          id: item.id, role: item.role, tag: item.tag, label: item.label, kind: kind,
          kw: 0, volts: a.voltage, phases: item.level === 'l2' ? 1 : a.phases,
          currentA: null, designA: null, ocpdA: null, spec: '', egc: '',
          cite: item.cite, note: 'kW is not on this equipment, so it is not sized.',
          lengthFt: null, dropPct: null
        });
        return;
      }
      var phases = item.level === 'l2' ? 1 : a.phases;
      var volts = item.level === 'l2' ? (num(item.volts) || (a.voltage <= 240 ? a.voltage : 208)) : a.voltage;
      if (item.level === 'l2' && a.voltage > 240) volts = 208;
      var current = lineCurrent(item.kw, volts, phases, item.role === 'compute' || item.role === 'ev' ? 1 : a.pf);
      var design = current * 1.25;
      if (amb != null && amb > 0) design = design / amb;
      var sized = sizeContinuous(design);
      var row = {
        id: item.id, role: item.role, tag: item.tag, endTag: item.endTag || '', label: item.label, kind: kind,
        level: item.level || '',
        kw: r1(item.kw), kwFrom: item.kwFrom || '',
        volts: volts, phases: phases,
        currentA: r1(current), designA: r1(design),
        cite: item.cite,
        lengthFt: null, dropPct: null, dropV: null,
        factorNote: factorNote
      };
      if (!sized || sized.error) {
        row.error = sized && sized.error ? sized.error : 'Not sized.';
        row.ocpdA = null; row.spec = ''; row.egc = ''; row.ampacity = null; row.sets = 0; row.cm = 0;
      } else {
        row.ocpdA = sized.ocpdA;
        row.spec = sized.spec;
        row.egc = sized.egc;
        row.ampacity = sized.ampacity;
        row.sets = sized.sets;
        row.awg = sized.awg;
        row.cm = sized.cm;
        row.nextHigher = sized.nextHigher;
        row.note = sized.nextHigher ? 'OCPD is the next standard rating above the conductor ampacity, which 240.4(B) allows at 800 A and below.' : '';
      }
      circuits.push(row);
    }
    for (i = 0; i < sources.length; i++) pushCircuit(sources[i], 'source');
    for (i = 0; i < loads.length; i++) pushCircuit(loads[i], 'load');

    /* One drawn conduit: its length is the feeder length for every sized circuit, and the sheet says so.
       More than one: lengths stay on the conduit schedule and voltage drop is not assigned. */
    var feederFt = conduits.length === 1 ? conduits[0].lengthFt : 0;
    if (feederFt > 0) {
      for (i = 0; i < circuits.length; i++) {
        if (!(circuits[i].currentA > 0) || !(circuits[i].cm > 0)) continue;
        var drop = voltageDrop(circuits[i].currentA, feederFt, circuits[i].cm, circuits[i].volts, circuits[i].phases);
        circuits[i].lengthFt = feederFt;
        if (drop) { circuits[i].dropPct = drop.pct; circuits[i].dropV = drop.volts; }
      }
    }

    var sourceKw = 0, loadKw = 0, sourceA = 0;
    for (i = 0; i < circuits.length; i++) {
      if (circuits[i].kind === 'source') { sourceKw += num(circuits[i].kw); sourceA += num(circuits[i].currentA); }
      else loadKw += num(circuits[i].kw);
    }

    /* Transformer: apparent power of the larger of sources and loads. No code multiplier. */
    var dutyKw = Math.max(sourceKw, loadKw);
    var requiredKva = a.pf > 0 ? dutyKw / a.pf : 0;
    var xfmr = null;
    if (xfmrs.length) {
      var nameplate = nextUp(KVA, requiredKva);
      xfmr = {
        tag: xfmrs[0].tag,
        count: xfmrs.length,
        requiredKva: Math.round(requiredKva),
        nameplateKva: nameplate,
        aboveTable: nameplate == null,
        primaryV: a.voltage,
        secondaryV: num(xfmrs[0].secondaryV) || null,
        zPct: num(xfmrs[0].zPct) || null,
        config: xfmrs[0].config || '',
        pf: a.pf,
        pfAssumed: a.pfAssumed
      };
    }

    /* Interconnection. Sources only. Chargers and compute are loads. */
    var interconnect = interconnectOf(a, sourceA, sources.length > 0);
    if (interconnect.method === 'supply') {
      var smallTap = false, si, sc;
      for (si = 0; si < circuits.length; si++) {
        sc = circuits[si];
        if (sc.kind !== 'source' || sc.sets !== 1) continue;
        if (sc.awg === '14' || sc.awg === '12' || sc.awg === '10' || sc.awg === '8') smallTap = true;
      }
      if (smallTap) {
        interconnect.ok = false;
        interconnect.cite = 'NEC 2023 705.11(B)';
        interconnect.title = 'Supply-side conductors are smaller than 6 AWG copper';
        interconnect.detail = '705.11(B) requires supply-side conductors to be at least 6 AWG copper or 4 AWG aluminum, and at least 125% of the source current. A sized source circuit is below 6 AWG.';
      }
    }

    /* Spacing. */
    var spacing = spacingOf(bess, parcels, buildings);

    /* Checks. */
    if (!hasContent) {
      addCheck('content', false, 'block', '', 'Nothing to document yet', 'Draw the site and place the equipment. The set is built from what is on the drawing.');
    } else {
      addCheck('content', true, 'info', '', 'The drawing has equipment', 'The sheets read this drawing.');
    }

    if (a.voltageAssumed && hasContent) {
      addCheck('voltage', false, 'review', '', 'Service voltage is assumed', '480 V, three-phase, is used because the project does not name a voltage. Change it on the project electrical record when the service is known.');
    }
    if (a.phasesAssumed && hasContent) {
      addCheck('phases', false, 'review', '', 'Three-phase is assumed', 'The project does not say single- or three-phase. A single-phase service is a different diagram.');
    }
    if (a.pfAssumed && sourceKw > 0) {
      addCheck('pf', false, 'review', '', 'Power factor is assumed', '0.95 is used to turn kW into current and transformer kVA. It is not a code value. The real power factor is the inverter nameplate.');
    }

    var missingKw = false, tooBig = false;
    for (i = 0; i < circuits.length; i++) {
      if (circuits[i].kw === 0) missingKw = true;
      if (circuits[i].error) tooBig = true;
    }
    if (missingKw) addCheck('kw', false, 'review', '', 'A rating is missing', 'Equipment with no kW is drawn and not sized. The schedule leaves those rows blank.');
    for (i = 0; i < sources.length; i++) {
      if (!sources[i].limited) continue;
      addCheck('pcs-limit-' + sources[i].id, false, 'review', 'NEC 2023 706.30(A)(2)',
        sources[i].endTag + ' is larger than its PCS',
        'The output circuit is sized from the PCS continuous output, ' + sources[i].pcsKw + ' kW. The battery is entered at ' + sources[i].batteryKw + ' kW. 706.30(A)(2) uses the inverter output rating.');
    }
    if (tooBig) addCheck('ampacity', false, 'block', 'NEC 2023 240.6(A), Table 310.16', 'A circuit could not be sized', 'The required device or conductor is past the standard ratings this set uses.');

    for (i = 0; i < circuits.length; i++) {
      if (circuits[i].dropPct == null) continue;
      var over = circuits[i].dropPct > 3;
      addCheck('vd-' + circuits[i].id, !over, over ? 'review' : 'info',
        'NEC 2023 210.19(A)(1) Informational Note No. 4; 215.2(A)(1) Informational Note No. 2',
        circuits[i].label + ' voltage drop is ' + circuits[i].dropPct + '%',
        over
          ? 'The informational note recommends 3% on a branch and 5% on the feeder plus branch. It is not itself a mandatory rule. The length is the one conduit drawn on the site.'
          : 'Within the 3% informational recommendation. The length is the one conduit drawn on the site.');
    }
    if (conduits.length > 1) {
      addCheck('vd-route', false, 'review', 'NEC 2023 210.19(A)(1) Informational Note No. 4',
        'Voltage drop is not assigned',
        'More than one conduit is drawn, and the drawing does not say which circuit is in which conduit. Lengths are on the conduit schedule only.');
    } else if (!conduits.length && hasContent) {
      addCheck('vd-none', false, 'review', 'NEC 2023 210.19(A)(1) Informational Note No. 4',
        'No conduit route is drawn',
        'Voltage drop is not calculated. Draw the route and it will be measured.');
    }

    if (!sources.length) {
      addCheck('nec705', true, 'info', 'NEC 2023 705.12', 'No power source is interconnected', 'Article 705 applies when a power source is connected to the utility. Chargers and other loads are not sources.');
    } else if (interconnect.method === 'unknown') {
      addCheck('nec705', false, 'review', 'NEC 2023 705.11, 705.12',
        'The interconnection method is not checked',
        'The service bus rating and the main device are not both on the project, and supply-side was not chosen. 705.12 cannot be confirmed or refused.');
    } else if (interconnect.method === 'supply') {
      addCheck('nec705', interconnect.ok, interconnect.ok ? 'info' : 'block', 'NEC 2023 705.11(B)',
        interconnect.ok ? 'Supply-side connection' : 'Supply-side conductors are undersized',
        interconnect.detail);
    } else if (interconnect.ok) {
      addCheck('nec705', true, 'info', interconnect.cite, interconnect.title, interconnect.detail);
    } else {
      addCheck('nec705', false, 'block', 'NEC 2023 705.12(B)', 'The bus rating does not accept this source', interconnect.detail);
    }

    if (bess.length >= 2) {
      addCheck('bess-gap', spacing.minUnitFt == null || spacing.minUnitFt + 1e-6 >= 3, spacing.minUnitFt != null && spacing.minUnitFt < 3 ? 'review' : 'info',
        'IFC 1207.5.3; NFPA 855 (2023) Table 9.5.2 / 9.4.2 where that table requires unit separation',
        spacing.minUnitFt == null ? 'Battery spacing was not measured' : 'Batteries are ' + r1(spacing.minUnitFt) + ' ft apart',
        '3 ft is the usual unit separation. A smaller distance is allowed when large-scale fire testing documents it. Remote outdoor installations are not all required to meet 9.4.2. The adopted fire code decides.');
    }
    if (bess.length && parcels.length) {
      var near = spacing.minLineFt != null && spacing.minLineFt < 10;
      addCheck('bess-line', !near, near ? 'review' : 'info',
        'NFPA 855 (2023) 9.5.2.6.1; IFC 1207.8.3',
        near ? 'A battery is ' + r1(spacing.minLineFt) + ' ft from the property line' : 'Batteries are at least 10 ft inside the property line',
        'Outdoor ESS near exposures are separated 10 ft from lot lines, public ways, buildings, stored combustibles, hazardous materials, high-piled stock and other exposures. Remote installations (more than 100 ft from those exposures) are classified differently. A fire barrier can reduce the 10 ft. This drawing cannot choose the classification.');
    }
    if (bess.length && buildings.length && spacing.minBuildingFt != null && spacing.minBuildingFt < 10) {
      addCheck('bess-bldg', false, 'review', 'NFPA 855 (2023) 9.5.2.6.1; IFC 1207.8.3',
        'A battery is ' + r1(spacing.minBuildingFt) + ' ft from a drawn obstruction',
        'If that obstruction is a building or stored combustibles, the 10 ft exposure clearance applies unless the installation is remote or a listed exception is used.');
    }

    var l2On480 = false;
    for (i = 0; i < loads.length; i++) {
      if (loads[i].level === 'l2' && a.voltage > 240) l2On480 = true;
    }
    var hasStepDown = false;
    if (xfmr && xfmr.secondaryV > 0 && xfmr.secondaryV <= 240) hasStepDown = true;
    if (l2On480 && !hasStepDown) {
      addCheck('l2-voltage', false, 'block', 'NEC 2023 625.40, 625.41',
        'Level 2 chargers need a 208 V or 240 V source',
        'The service is above 240 V and no transformer secondary at 208 V or 240 V is on the drawing. A DC fast charger is not a Level 2 source.');
    }

    if (xfmrs.length) {
      addCheck('xfmr-z', !!xfmr.zPct, xfmr.zPct ? 'info' : 'review', 'NEC 2023 450.3',
        xfmr.zPct ? 'Transformer impedance is on the drawing' : 'Transformer impedance is blank',
        xfmr.zPct
          ? 'Percent impedance is the value entered on the transformer. It is not calculated.'
          : 'Percent impedance and the winding configuration are nameplate facts. NEC 450.3 overcurrent depends on them and is not calculated without them. kVA is the apparent power rounded up to a standard nameplate, with no extra multiplier.');
    }

    if (arrays.length) {
      var stringKnown = true;
      for (i = 0; i < arrays.length; i++) if (!(arrays[i].isc > 0) || !(arrays[i].voc > 0)) stringKnown = false;
      addCheck('strings', stringKnown, stringKnown ? 'info' : 'review', 'NEC 2023 690.7, 690.8(A)(1)(a)',
        stringKnown ? 'String current is on the array' : 'String length is not calculated',
        stringKnown
          ? 'Maximum PV source-circuit current uses 125% of the module short-circuit current for a system under 100 kW, per 690.8(A)(1)(a)(1). A system of 100 kW or more follows 690.8(A)(1)(a)(2).'
          : '690.7 maximum voltage and 690.8 source-circuit current need the module Voc, Vmp and Isc. The EAGLE G7B wattage is known; those electrical values are not on the drawing, so no string count is invented.');
    }

    if (fences.length) {
      var gate = hasWord(entities, 'gate');
      addCheck('gate', gate, gate ? 'info' : 'review', '', gate ? 'A gate is noted' : 'No gate is marked',
        gate ? 'A note on the drawing says gate.' : 'The fence is drawn. A vehicle gate is not identified on the drawing.');
    }
    if (hasContent) {
      var fire = hasWord(entities, 'fire access') || hasWord(entities, 'apparatus');
      addCheck('fire-access', fire, fire ? 'info' : 'review', 'IFC 503',
        fire ? 'Fire access is noted' : 'Fire apparatus access is not marked',
        'IFC 503 is adopted locally. The unobstructed width and the turning dimensions are the jurisdiction\'s. This set does not invent them.');
    }

    addCheck('seal', false, 'info', '', 'The engineer of record has not sealed this set',
      'The stamp and signature boxes are blank. Nothing in this file is a seal, and exporting it does not make it one.');

    if (a.adoptedNec && a.adoptedNec !== a.nec) {
      addCheck('adopted', false, 'review', 'NEC ' + a.adoptedNec, 'The jurisdiction\'s edition is not the edition calculated',
        'These sheets use NEC ' + a.nec + '. The project says the jurisdiction adopted ' + a.adoptedNec + '. An engineer has to reconcile the two before the set is sealed.');
    }

    var blocks = [], notes = [];
    for (i = 0; i < checks.length; i++) {
      if (!checks[i].ok && checks[i].severity === 'block') blocks.push(checks[i]);
      else if (!checks[i].ok && checks[i].severity === 'review') notes.push(checks[i]);
    }
    var applicable = 0, passed = 0;
    for (i = 0; i < checks.length; i++) {
      if (checks[i].severity === 'info' && checks[i].ok) { applicable++; passed++; }
      else if (checks[i].severity !== 'info') { applicable++; if (checks[i].ok) passed++; }
    }

    var specs = specRows(doc, equipment, arrays, catalog);

    return {
      assumptions: a,
      hasContent: hasContent,
      ready: hasContent && blocks.length === 0,
      blocks: blocks,
      notes: notes,
      score: applicable ? Math.round(100 * passed / applicable) : 0,
      equipment: equipment.map(publicEquip),
      arrays: arrays,
      conduits: conduits,
      trenches: trenches,
      setbacks: setbacks.map(function (s) { return { distance: num(s.distance), id: s.id }; }),
      fences: fences.length,
      circuits: circuits,
      sources: sources,
      loads: loads,
      transformer: xfmr,
      interconnect: interconnect,
      spacing: spacing,
      checks: checks,
      specs: specs,
      sourceKw: r1(sourceKw),
      loadKw: r1(loadKw),
      sourceA: r1(sourceA),
      factorNote: factorNote,
      placards: placards(sources, loads, interconnect, a),
      sld: sldModel(a, circuits, xfmr, meters, pois, interconnect)
    };
  }

  function equipRecord(e, id, fallback) {
    return {
      id: e.id, tag: id, key: e.key, label: e.label || fallback,
      kw: num(e.kw), kwh: num(e.kwh),
      x: num(e.x), y: num(e.y), w: num(e.w), h: num(e.h), rot: num(e.rot),
      level: e.level || '',
      secondaryV: num(e.secondaryV), zPct: num(e.zPct), config: e.config || e.vector || '',
      sku: e.sku || '', datasheet: e.datasheet || '',
      mfr: e.mfr || '', model: e.model || ''
    };
  }
  function publicEquip(e) {
    return {
      tag: e.tag, key: e.key, label: e.label, kw: e.kw, kwh: e.kwh,
      w: e.w, h: e.h, mfr: e.mfr, model: e.model, sku: e.sku,
      zPct: e.zPct || null, config: e.config, secondaryV: e.secondaryV || null,
      level: e.level, datasheet: e.datasheet
    };
  }

  function nearestFree(unit, list, used) {
    var best = null, bestD = Infinity, i, d;
    for (i = 0; i < list.length; i++) {
      if (used[list[i].tag]) continue;
      d = Math.abs(list[i].x - unit.x) + Math.abs(list[i].y - unit.y);
      if (d < bestD) { bestD = d; best = list[i]; }
    }
    if (best) used[best.tag] = true;
    return best;
  }

  function interconnectOf(a, sourceA, hasSource) {
    var i125 = sourceA * 1.25;
    var out = {
      hasSource: hasSource, sourceA: r1(sourceA), i125: r1(i125),
      busA: a.busA, mainA: a.mainA, method: 'unknown', ok: false,
      cite: '', title: '', detail: ''
    };
    if (!hasSource) { out.method = 'none'; out.ok = true; return out; }
    if (a.method === 'supply') {
      out.method = 'supply';
      out.ok = true;
      out.cite = 'NEC 2023 705.11';
      out.title = 'Supply-side source connection';
      out.detail = 'Chosen method is a supply-side connection under 705.11. Conductors are sized at 125% of the source current and not smaller than 6 AWG copper, per 705.11(B). The disconnect is 705.11(D). The 120% bus rule does not apply. The utility still has to accept the tap, and 705.11(C) requires the splice to follow 230.46.';
      return out;
    }
    if (!(a.busA > 0) || !(a.mainA > 0)) return out;
    var sum = a.mainA + i125;
    var pass100 = sum <= a.busA + 1e-6;
    var pass120 = sum <= a.busA * 1.2 + 1e-6;
    out.sumA = Math.round(sum);
    if (a.method === '100' || (a.method === 'auto' && pass100)) {
      out.method = '100';
      out.ok = pass100;
      out.cite = 'NEC 2023 705.12(B)(1)';
      out.title = pass100 ? 'Bus rule, 100%' : 'The 100% bus rule is not met';
      out.detail = '125% of the source current (' + r1(i125) + ' A) plus the main device (' + a.mainA + ' A) is ' + Math.round(sum) + ' A. The bus is ' + a.busA + ' A. 705.12(B)(1) allows that sum up to the bus rating.';
      return out;
    }
    if (a.method === '120' || a.method === 'auto') {
      out.method = '120';
      out.ok = pass120;
      out.cite = 'NEC 2023 705.12(B)(2)';
      out.title = pass120 ? 'Bus rule, 120%, sources at opposite ends' : 'The 120% bus rule is not met';
      out.detail = '125% of the source current (' + r1(i125) + ' A) plus the main device (' + a.mainA + ' A) is ' + Math.round(sum) + ' A. 120% of the ' + a.busA + ' A bus is ' + r1(a.busA * 1.2) + ' A. 705.12(B)(2) allows this only when the primary source and the other source are at opposite ends of a bus that contains loads, and the source device is not relocated. The 2023 marking rules for that device sit in 705.30; confirm the subsection in the adopted edition before the placard is sealed.';
      return out;
    }
    return out;
  }

  function spacingOf(bess, parcels, buildings) {
    var i, j, d, minU = null, minL = null, minB = null;
    for (i = 0; i < bess.length; i++) {
      for (j = i + 1; j < bess.length; j++) {
        d = ringDist(equipRing(bess[i]), equipRing(bess[j]));
        if (d != null && (minU == null || d < minU)) minU = d;
      }
      for (j = 0; j < parcels.length; j++) {
        var ring = G.ringOf(parcels[j]);
        d = ring ? ringDist(equipRing(bess[i]), ring) : null;
        if (d != null && (minL == null || d < minL)) minL = d;
      }
      for (j = 0; j < buildings.length; j++) {
        var bring = G.ringOf(buildings[j]);
        d = bring ? ringDist(equipRing(bess[i]), bring) : null;
        if (d != null && (minB == null || d < minB)) minB = d;
      }
    }
    return {
      minUnitFt: minU == null ? null : r1(minU),
      minLineFt: minL == null ? null : r1(minL),
      minBuildingFt: minB == null ? null : r1(minB)
    };
  }

  function hasWord(entities, word) {
    var i, e, t, w = word.toLowerCase();
    for (i = 0; i < entities.length; i++) {
      e = entities[i];
      t = ((e && (e.text || e.label)) || '').toLowerCase();
      if (t.indexOf(w) >= 0) return true;
    }
    return false;
  }

  function placards(sources, loads, interconnect, a) {
    var rows = [];
    var pv = false, ess = false, i;
    for (i = 0; i < sources.length; i++) {
      if (sources[i].role === 'pv') pv = true;
      if (sources[i].role === 'ess') ess = true;
    }
    if (sources.length) {
      rows.push({
        cite: 'NEC 2023 705.10',
        where: 'Service equipment, or another readily visible place the AHJ accepts',
        text: 'A permanent directory of every power source on the premises.'
      });
    }
    if (pv) {
      rows.push({
        cite: 'NEC 2023 690.56(B)',
        where: 'The service disconnect and the PV system disconnect',
        text: 'A permanent plaque or directory denoting the location of the service disconnecting means and the PV system disconnecting means, when both are not at the same location.'
      });
      rows.push({
        cite: 'NEC 2023 690.56(C)',
        where: 'Where 690.12 rapid shutdown applies',
        text: 'The rapid-shutdown label. This drawing does not decide whether the array is on or in a building, so it does not decide that 690.12 applies.'
      });
    }
    if (ess) {
      rows.push({
        cite: 'NEC 2023 706.15',
        where: 'The ESS disconnecting means',
        text: 'Mark the ESS disconnect. The exact legend follows 706.15 in the adopted edition.'
      });
    }
    rows.push({
      cite: 'NEC 2023 110.16; NFPA 70E',
      where: 'Equipment likely to be examined while energized',
      text: 'Arc-flash warning label. Incident energy is not calculated in this set. NFPA 70E is the work-practice standard; this sheet does not replace a study.'
    });
    if (interconnect.method === '120' && interconnect.ok) {
      rows.push({
        cite: 'NEC 2023 705.12(B)(2); marking in 705.30',
        where: 'The source overcurrent device',
        text: 'Warning that this source device must stay at the opposite end of the bus from the primary source and must not be relocated. Confirm the 2023 subsection before sealing the placard.'
      });
    }
    if (!sources.length && loads.length) {
      rows.push({
        cite: 'NEC 2023 110.21(B)',
        where: 'Equipment',
        text: 'Field-applied hazard markings follow 110.21(B) and ANSI Z535. No power-source directory is required when no power source is installed.'
      });
    }
    return rows;
  }

  function sldModel(a, circuits, xfmr, meters, pois, interconnect) {
    var spine = [
      { kind: 'utility', label: pois.length ? pois[0].tag : 'Utility', sub: 'Source' },
      { kind: 'meter', label: meters.length ? meters[0].tag : 'Meter', sub: 'Utility meter' },
      { kind: 'breaker', label: a.mainA > 0 ? (a.mainA + ' A') : 'Main', sub: a.mainA > 0 ? 'Main device, as entered' : 'Main, sized on the schedule' }
    ];
    if (xfmr) {
      spine.push({
        kind: 'transformer',
        label: xfmr.tag,
        sub: (xfmr.nameplateKva ? xfmr.nameplateKva + ' kVA' : 'kVA blank') + (xfmr.zPct ? '  Z ' + xfmr.zPct + '%' : '  Z blank')
      });
    }
    var branches = [], i, c, items, endKind, endSub;
    for (i = 0; i < circuits.length; i++) {
      c = circuits[i];
      if (c.kind === 'source' && c.role === 'pv') endKind = 'pv';
      else if (c.kind === 'source') endKind = 'bess';
      else if (c.role === 'ev') endKind = 'charger';
      else endKind = 'load';
      endSub = c.kw ? (c.kw + ' kW') : 'kW blank';
      items = [
        { kind: 'breaker', label: c.ocpdA ? (c.ocpdA + ' A') : 'OCPD', sub: c.spec || c.note || '' },
        { kind: 'disco', label: 'Disc.', sub: '705.20' }
      ];
      if (c.role === 'ess' || c.role === 'pv') {
        items.push({ kind: c.role === 'pv' ? 'inverter' : 'pcs', label: c.tag, sub: c.volts + ' V' });
      }
      items.push({ kind: endKind, label: c.endTag || c.tag, sub: endSub });
      branches.push({ id: c.id, items: items, spec: c.spec || '', drop: c.dropPct });
    }
    return {
      volts: a.voltage,
      phases: a.phases,
      spine: spine,
      bus: { label: a.voltage + ' V' + (a.phases === 3 ? ' 3-ph' : ' 1-ph') },
      branches: branches,
      ground: true,
      interconnect: interconnect.method
    };
  }

  function specRows(doc, equipment, arrays, catalog) {
    var rows = [], i, e, hit, mod = G.MODULE;
    if (arrays.length) {
      rows.push({
        item: mod.make + ' ' + mod.line,
        sku: mod.sku,
        fact: mod.watts + ' W, frame ' + mod.widthMm + ' × ' + mod.heightMm + ' mm',
        sheet: 'Datasheet PDF is not in the Site Plan catalog.'
      });
    }
    for (i = 0; i < equipment.length; i++) {
      e = equipment[i];
      hit = e.sku && catalog[e.sku] ? catalog[e.sku] : null;
      rows.push({
        item: (e.mfr ? e.mfr + ' ' : '') + (e.model || e.label),
        sku: e.sku || '',
        fact: [e.kw ? e.kw + ' kW' : '', e.kwh ? e.kwh + ' kWh' : '', e.w && e.h ? e.w + ' × ' + e.h + ' ft on the drawing' : ''].filter(Boolean).join(', '),
        sheet: e.datasheet || (hit && hit.datasheet) || 'Datasheet not on file.'
      });
    }
    if (!rows.length) {
      rows.push({ item: 'No equipment', sku: '', fact: '', sheet: 'Place equipment and the catalog row will follow, when a datasheet is on file.' });
    }
    return rows;
  }

  function readiness(doc, catalog) {
    var m = analyze(doc, catalog);
    return {
      ready: m.ready,
      score: m.score,
      summary: m.ready
        ? (m.notes.length ? ('Ready to review. ' + m.notes.length + (m.notes.length === 1 ? ' note is' : ' notes are') + ' printed in the set.') : 'Ready to review.')
        : ('Not ready. ' + (m.blocks[0] ? m.blocks[0].title : 'The drawing is empty.')),
      blocks: m.blocks,
      notes: m.notes
    };
  }

  /* Stable projection for the golden files. No coordinates, no ids that are random. */
  function golden(doc, catalog) {
    var m = analyze(doc, catalog);
    return {
      ready: m.ready,
      score: m.score,
      sourceKw: m.sourceKw,
      loadKw: m.loadKw,
      sourceA: m.sourceA,
      interconnect: {
        method: m.interconnect.method, ok: m.interconnect.ok, cite: m.interconnect.cite, sumA: m.interconnect.sumA || null
      },
      transformer: m.transformer ? {
        requiredKva: m.transformer.requiredKva, nameplateKva: m.transformer.nameplateKva, zPct: m.transformer.zPct
      } : null,
      circuits: m.circuits.map(function (c) {
        return {
          id: c.id, role: c.role, kw: c.kw, volts: c.volts, phases: c.phases,
          currentA: c.currentA, designA: c.designA, ocpdA: c.ocpdA, spec: c.spec, egc: c.egc,
          lengthFt: c.lengthFt, dropPct: c.dropPct, cite: c.cite, error: c.error || ''
        };
      }),
      checks: m.checks.map(function (c) {
        return { id: c.id, ok: c.ok, severity: c.severity, cite: c.cite };
      }),
      spacing: m.spacing,
      placardCites: m.placards.map(function (p) { return p.cite; })
    };
  }

  function fixtures() {
    function base(name, address, customer, electrical) {
      var doc = D.create({
        name: name, address: address,
        assignment: { customerName: customer, stakeholders: [{ role: 'contact', name: 'Site contact', company: customer }] }
      });
      doc.electrical = electrical || {};
      return doc;
    }
    function add(doc, e) { e.id = e.id || ('e_' + doc.entities.length); doc.entities.push(e); return e; }

    function sample() {
      var doc = base('Sample industrial site', 'Sample parcel', 'Sample customer', {});
      var parcel = add(doc, { type: 'polygon', layer: 'site', closed: true, pts: [
        { x: 0, y: 0 }, { x: 420, y: 0 }, { x: 420, y: 280 }, { x: 0, y: 280 }
      ]});
      add(doc, { type: 'array', layer: 'array', boundaryId: parcel.id, mount: 'fixed-ground', setbackFt: 15 });
      add(doc, { type: 'obstruction', layer: 'obstruction', closed: true, pts: [
        { x: 300, y: 170 }, { x: 390, y: 170 }, { x: 390, y: 245 }, { x: 300, y: 245 }
      ]});
      add(doc, { type: 'equip', layer: 'equipment', key: 'bess', label: 'BESS', x: 48, y: 36, w: 28, h: 10, rot: 0, kw: 500, kwh: 1000 });
      add(doc, { type: 'equip', layer: 'equipment', key: 'pcs', label: 'PCS', x: 78, y: 36, w: 8, h: 4, rot: 0, kw: 250, kwh: 0 });
      add(doc, { type: 'equip', layer: 'equipment', key: 'transformer', label: 'Transformer', x: 36, y: 18, w: 8, h: 6, rot: 0 });
      add(doc, { type: 'equip', layer: 'equipment', key: 'meter', label: 'Meter', x: 22, y: 16, w: 3, h: 2, rot: 0 });
      add(doc, { type: 'equip', layer: 'equipment', key: 'poi', label: 'POI', x: 12, y: 12, w: 4, h: 4, rot: 0 });
      add(doc, { type: 'conduit', layer: 'conduit', spec: 'RMC', pts: [{ x: 12, y: 12 }, { x: 12, y: 36 }, { x: 48, y: 36 }] });
      add(doc, { type: 'dim', layer: 'dimension', a: { x: 0, y: 0 }, b: { x: 420, y: 0 }, offset: -14 });
      add(doc, { type: 'callout', layer: 'annotation', target: { x: 345, y: 200 }, anchor: { x: 250, y: 255 }, text: 'Existing building' });
      return doc;
    }

    function bess1mw() {
      var doc = base('Reference 1 MW 4-hour BESS', '100 Storage Road', 'Reference Storage LLC', {
        voltage: 480, phases: 3, pf: 0.95, method: 'supply', ahj: 'Reference AHJ', jurisdiction: 'Reference County'
      });
      add(doc, { type: 'polygon', layer: 'site', closed: true, pts: [
        { x: 0, y: 0 }, { x: 220, y: 0 }, { x: 220, y: 160 }, { x: 0, y: 160 }
      ]});
      add(doc, { type: 'equip', key: 'poi', layer: 'equipment', label: 'POI', x: 30, y: 30, w: 4, h: 4, kw: 0 });
      add(doc, { type: 'equip', key: 'meter', layer: 'equipment', label: 'Meter', x: 48, y: 30, w: 3, h: 2, kw: 0 });
      add(doc, { type: 'equip', key: 'transformer', layer: 'equipment', label: 'Transformer', x: 70, y: 40, w: 10, h: 8, kw: 0, zPct: 5.75, config: 'Dyn11' });
      add(doc, { type: 'equip', key: 'pcs', layer: 'equipment', label: 'PCS', x: 100, y: 70, w: 8, h: 4, kw: 1000 });
      add(doc, { type: 'equip', key: 'bess', layer: 'equipment', label: 'BESS', x: 130, y: 80, w: 40, h: 8, kw: 1000, kwh: 4000 });
      add(doc, { type: 'conduit', layer: 'conduit', spec: 'PVC', pts: [{ x: 30, y: 30 }, { x: 130, y: 30 }, { x: 130, y: 80 }] });
      add(doc, { type: 'fence', layer: 'site', pts: [{ x: 10, y: 10 }, { x: 200, y: 10 }, { x: 200, y: 140 }, { x: 10, y: 140 }], closed: true });
      add(doc, { type: 'text', layer: 'annotation', x: 20, y: 12, text: 'Gate', h: 2 });
      return doc;
    }

    function commercialPv() {
      var doc = base('Reference commercial PV', '200 Array Avenue', 'Reference Solar LLC', {
        voltage: 480, phases: 3, pf: 0.95, method: 'auto', busA: 800, mainA: 400, ahj: 'Reference AHJ'
      });
      var parcel = add(doc, { type: 'polygon', layer: 'site', closed: true, pts: [
        { x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 120 }, { x: 0, y: 120 }
      ]});
      add(doc, { type: 'array', layer: 'array', boundaryId: parcel.id, mount: 'fixed-ground', setbackFt: 10 });
      add(doc, { type: 'equip', key: 'poi', layer: 'equipment', label: 'POI', x: 16, y: 16, w: 4, h: 4 });
      add(doc, { type: 'equip', key: 'meter', layer: 'equipment', label: 'Meter', x: 28, y: 16, w: 3, h: 2 });
      add(doc, { type: 'conduit', layer: 'conduit', spec: 'RMC', pts: [{ x: 16, y: 16 }, { x: 16, y: 60 }] });
      return doc;
    }

    function dcfc() {
      var doc = base('Reference DCFC site', '300 Charger Road', 'Reference Charging LLC', {
        voltage: 480, phases: 3, pf: 1, ahj: 'Reference AHJ'
      });
      add(doc, { type: 'polygon', layer: 'site', closed: true, pts: [
        { x: 0, y: 0 }, { x: 180, y: 0 }, { x: 180, y: 100 }, { x: 0, y: 100 }
      ]});
      add(doc, { type: 'equip', key: 'poi', layer: 'equipment', label: 'POI', x: 20, y: 20, w: 4, h: 4 });
      add(doc, { type: 'equip', key: 'meter', layer: 'equipment', label: 'Meter', x: 36, y: 20, w: 3, h: 2 });
      add(doc, { type: 'equip', key: 'transformer', layer: 'equipment', label: 'Transformer', x: 60, y: 30, w: 8, h: 6, zPct: 5.5, config: 'Dyn11' });
      var n;
      for (n = 0; n < 4; n++) {
        add(doc, { type: 'equip', key: 'charger', layer: 'equipment', label: 'DCFC', level: 'dcfc', x: 40 + n * 28, y: 70, w: 3, h: 8, kw: 150 });
      }
      add(doc, { type: 'conduit', layer: 'conduit', spec: 'RMC', pts: [{ x: 20, y: 20 }, { x: 120, y: 20 }, { x: 120, y: 70 }] });
      return doc;
    }

    return { sample: sample, bess1mw: bess1mw, commercialPv: commercialPv, dcfc: dcfc };
  }

  var api = {
    OCPD: OCPD,
    CU: CU,
    K_CU: K_CU,
    lineCurrent: lineCurrent,
    sizeContinuous: sizeContinuous,
    voltageDrop: voltageDrop,
    egcOf: egcOf,
    analyze: analyze,
    readiness: readiness,
    golden: golden,
    fixtures: fixtures(),
    assumptions: assumptions,
    VERSION: 'editor-v2-electrical/1'
  };
  root.OmegaEditorV2Electrical = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : global);
