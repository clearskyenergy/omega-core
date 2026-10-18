/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 *
 * omega-editor-v2-design.js — the drawing as the other tools read it.
 *
 * The map is the source. fromDoc rebuilds this model from the document
 * every time. Nothing here is stored back onto the document, so a later
 * edit cannot leave a stale copy. 3D (view3d) and the permit set / one-line
 * (permit, sld) take the object publish() hands them.
 *
 * Schema omega.design/1.
 * x, y, w, h are the point the drawing stored. corners is the footprint
 * the canvas paints (rectCorners treats x, y as the center). A guided
 * build writes x, y as the left edge of its row; the conduit points use
 * that same edge. Wires match those points first.
 *
 * A field that is not on the drawing is null. This file does not invent
 * a manufacturer, a voltage, a breaker, a string count, a gauge, a
 * height, or a burial depth. Those are rows in parity, status "gap".
 */
(function (root) {
  'use strict';

  var D = root.OmegaEditorV2Doc || (typeof require === 'function' ? require('./omega-editor-v2-doc.js') : null);
  var G = root.OmegaEditorV2Geom || (typeof require === 'function' ? require('./omega-editor-v2-geom.js') : null);

  var SCHEMA = 'omega.design/1';
  var ROLES = {
    bess: 'bess', pcs: 'pcs', transformer: 'xfmr', meter: 'meter', poi: 'utility',
    disco: 'disco', panel: 'panel', ems: 'pcs', ups: 'pcs', genset: 'dergen',
    fuelcell: 'derfc', pv: 'dersolar', wind: 'derwind', substation: 'utility',
    racks: 'panel', cooling: 'panel'
  };
  var DC = { 'RMC-DC': 1, 'BAT-DC': 1 };
  var listeners = [];

  function num(v) { var n = +v; return isFinite(n) ? n : null; }
  function text(v) {
    if (v == null) return null;
    var s = String(v).replace(/^\s+|\s+$/g, '');
    return s ? s : null;
  }
  function copy(v) { return JSON.parse(JSON.stringify(v)); }
  function roleOf(e) {
    if (!e || !e.key) return null;
    if (e.key === 'charger') {
      if (e.level === 'dcfc') return 'evdcfc';
      if (e.level === 'l2') return 'evl2';
      return null;
    }
    return ROLES[e.key] || null;
  }
  function ringArea(pts) {
    if (!G || !pts || pts.length < 3) return 0;
    return G.area(pts);
  }
  function near(a, b) { return Math.abs(a - b) <= 0.2; }

  function equipmentOf(doc) {
    var out = [], i, e, row, corners;
    var list = doc.entities || [];
    for (i = 0; i < list.length; i++) {
      e = list[i];
      if (e.type !== 'equip' && !(e.type === 'rect' && e.key)) continue;
      corners = (G && e.w > 0 && e.h > 0) ? G.rectCorners(e) : [];
      row = {
        id: e.id,
        type: e.type,
        key: e.key || null,
        role: roleOf(e),
        label: text(e.label),
        layer: e.layer || null,
        groupId: e.groupId || null,
        x: num(e.x), y: num(e.y), w: num(e.w), h: num(e.h), rot: num(e.rot) || 0,
        corners: corners,
        kw: num(e.kw), kwh: num(e.kwh), ports: num(e.ports),
        level: text(e.level), derKw: num(e.derKw),
        mfr: text(e.mfr), model: text(e.model),
        voltage: num(e.voltage), heightFt: num(e.heightFt)
      };
      out.push(row);
    }
    return out;
  }

  function plannerHit(pt, which, gear, avoid) {
    var i, e, hits = [];
    if (!pt) return null;
    for (i = 0; i < gear.length; i++) {
      e = gear[i];
      if (avoid && e.id === avoid) continue;
      if (e.x == null || e.w == null || e.h == null) continue;
      if (which === 'from') {
        if (near(pt.x, e.x + e.w) && near(pt.y, e.y + e.h / 2)) hits.push(e);
      } else if (near(pt.x, e.x) && near(pt.y, e.y + e.h / 2)) hits.push(e);
    }
    return hits.length ? hits[0] : null;
  }
  function nearestCenter(pt, gear, avoid) {
    var i, e, dx, dy, d, limit, best = null, bestD = Infinity;
    if (!pt) return null;
    for (i = 0; i < gear.length; i++) {
      e = gear[i];
      if (avoid && e.id === avoid) continue;
      if (e.x == null) continue;
      dx = pt.x - e.x; dy = pt.y - e.y;
      d = Math.sqrt(dx * dx + dy * dy);
      limit = Math.sqrt((e.w || 0) * (e.w || 0) + (e.h || 0) * (e.h || 0)) + 2;
      if (d <= limit && d < bestD) { bestD = d; best = e; }
    }
    return best;
  }
  function matchEnd(pt, which, gear, avoid) {
    return plannerHit(pt, which, gear, avoid) || nearestCenter(pt, gear, avoid);
  }

  function conduitsOf(doc, gear) {
    var out = [], i, e, pts, a, b, from, to;
    var list = doc.entities || [];
    for (i = 0; i < list.length; i++) {
      e = list[i];
      if (e.type !== 'conduit') continue;
      pts = e.pts || [];
      a = pts[0] || null;
      b = pts.length ? pts[pts.length - 1] : null;
      from = matchEnd(a, 'from', gear, null);
      to = matchEnd(b, 'to', gear, from ? from.id : null);
      if (from && to && from.id === to.id) to = null;
      out.push({
        id: e.id,
        spec: text(e.spec),
        kind: DC[e.spec] ? 'dc' : 'ac',
        layer: e.layer || null,
        pts: copy(pts),
        fromId: from ? from.id : null,
        toId: to ? to.id : null,
        gauge: text(e.gauge),
        depthFt: num(e.depthFt)
      });
    }
    return out;
  }

  function arraysOf(doc) {
    D = D || root.OmegaEditorV2Doc;
    G = G || root.OmegaEditorV2Geom;
    var out = [], i, e, lay, mod = null;
    var list = doc.entities || [];
    for (i = 0; i < list.length; i++) {
      e = list[i];
      if (e.type !== 'array') continue;
      lay = D.arrayLayout(doc, e);
      if (lay && lay.ok && lay.moduleKey && G && G.MODULE && G.MODULE.key === lay.moduleKey) {
        mod = { key: G.MODULE.key, mfr: G.MODULE.mfr, line: G.MODULE.line, watts: G.MODULE.watts };
      } else mod = null;
      out.push({
        id: e.id,
        boundaryId: e.boundaryId || null,
        mount: e.mount || null,
        setbackFt: e.setbackFt != null ? num(e.setbackFt) : null,
        ok: !!(lay && lay.ok),
        kw: lay && lay.ok ? lay.kw : null,
        kwAc: lay && lay.ok ? lay.kwAc : null,
        tableCount: lay && lay.ok ? lay.tableCount : null,
        moduleCount: lay && lay.ok ? lay.moduleCount : null,
        moduleKey: lay && lay.ok ? (lay.moduleKey || null) : null,
        module: mod
      });
    }
    return out;
  }

  function siteOf(doc) {
    var boundary = null, best = 0, setbacks = [], obstructions = [], fences = [], i, e, pts, area;
    var list = doc.entities || [];
    for (i = 0; i < list.length; i++) {
      e = list[i];
      pts = e.pts ? copy(e.pts) : null;
      if (e.type === 'polygon') {
        area = ringArea(e.pts);
        if (area >= best) { best = area; boundary = { id: e.id, pts: pts, areaSqft: Math.round(area) }; }
      } else if (e.type === 'setback' || e.layer === 'setback') {
        setbacks.push({ id: e.id, pts: pts, distance: num(e.distance) });
      } else if (e.type === 'obstruction' || e.layer === 'obstruction') {
        obstructions.push({ id: e.id, pts: pts });
      } else if (e.type === 'fence' || e.key === 'fence') {
        fences.push({ id: e.id, pts: pts, closed: !!e.closed });
      }
    }
    return { boundary: boundary, setbacks: setbacks, obstructions: obstructions, fences: fences };
  }

  function nodesOf(gear) {
    var out = [], i, e;
    for (i = 0; i < gear.length; i++) {
      e = gear[i];
      if (!e.role) continue;
      out.push({ id: e.id, role: e.role, key: e.key, label: e.label, kw: e.kw, kwh: e.kwh, x: e.x, y: e.y });
    }
    return out;
  }
  function wiresOf(conduits) {
    var out = [], i, c;
    for (i = 0; i < conduits.length; i++) {
      c = conduits[i];
      out.push({ id: c.id, fromId: c.fromId, toId: c.toId, spec: c.spec, kind: c.kind });
    }
    return out;
  }

  function row(id, sheet, item, status, note) {
    return { id: id, sheet: sheet, item: item, status: status, note: note };
  }
  function parityOf(site, gear, conduits, arrays) {
    var i, hasModule = false, anyVoltage = false, anyHeight = false, anyGauge = false, anyDepth = false, anyMfr = false, anyModel = false;
    for (i = 0; i < arrays.length; i++) if (arrays[i].moduleKey) hasModule = true;
    for (i = 0; i < gear.length; i++) {
      if (gear[i].voltage != null) anyVoltage = true;
      if (gear[i].heightFt != null) anyHeight = true;
      if (gear[i].mfr) anyMfr = true;
      if (gear[i].model) anyModel = true;
    }
    for (i = 0; i < conduits.length; i++) {
      if (conduits[i].gauge) anyGauge = true;
      if (conduits[i].depthFt != null) anyDepth = true;
    }
    return [
      row('coordinates', 'E1.0', 'Plan coordinates in feet', 'on-drawing', 'Coordinates are feet on the map. The older editor stored pixels.'),
      row('parcel', 'E1.0', 'Parcel boundary', site.boundary ? 'on-drawing' : 'gap', site.boundary ? 'The largest site polygon is the boundary.' : 'No site polygon is on the drawing.'),
      row('setbacks', 'E1.0', 'Setbacks', site.setbacks.length ? 'on-drawing' : 'gap', site.setbacks.length ? 'Setback polygons are on the drawing.' : 'No setback polygon is drawn.'),
      row('obstructions', 'E1.0', 'Obstructions', site.obstructions.length ? 'on-drawing' : 'gap', site.obstructions.length ? 'Obstructions are on the drawing.' : 'No obstruction is drawn.'),
      row('rotation', 'E1.0', 'Rotation', 'on-drawing', 'Rotation is the stored rot. corners follow it.'),
      row('equipment-footprint', 'E1.0', 'Equipment footprint', gear.length ? 'on-drawing' : 'gap', gear.length ? 'Each footprint is the stored size plus the canvas corners.' : 'No equipment is on the drawing.'),
      row('one-line', 'E2.0', 'One-line chain', conduits.length ? 'on-drawing' : 'gap', 'Nodes and wires follow the placed chain, including the raceway family. The older one-line invented a generic tree.'),
      row('raceway', 'E5', 'Raceway family', conduits.length ? 'on-drawing' : 'gap', 'The raceway family is the conduit spec on the drawing.'),
      row('schedule', 'E5', 'Equipment and conduit schedule data', (gear.length || conduits.length) ? 'on-drawing' : 'gap', 'The rows are on the drawing. The sheet itself is the permit set.'),
      row('module-racking', 'S1.3', 'Module and racking', hasModule ? 'partial' : 'gap', hasModule ? 'The module is the one the array layout used. Racking steel is not drawn.' : 'No array layout is on the drawing.'),
      row('manufacturer', 'E0', 'Manufacturer', anyMfr ? 'partial' : 'gap', 'A manufacturer is copied only when the equipment record already has one. A cover sheet must not fill one in.'),
      row('model', 'E5', 'Equipment model', anyModel ? 'partial' : 'gap', 'A model is copied only when the equipment record already has one.'),
      row('voltage', 'E0', 'System voltage', anyVoltage ? 'partial' : 'gap', 'System voltage is copied only when a piece of equipment already has one. A cover default is not a fact.'),
      row('amps', 'E2.0', 'Breaker and amps', 'gap', 'Breaker size is not on the drawing. The older one-line assumed a voltage and a factor. This model does not.'),
      row('strings-kva', 'E2.0', 'String count and block kVA', 'gap', 'String count and block transformer kVA are not on the drawing. Typed defaults are not facts.'),
      row('gauge', 'E5', 'Conductor gauge', anyGauge ? 'partial' : 'gap', 'The raceway family is on the drawing. Conductor gauge is not, unless a conduit already carries one.'),
      row('burial', 'E1.0', 'Conduit burial depth', anyDepth ? 'partial' : 'gap', 'Burial depth is not on the drawing, unless a conduit already carries one.'),
      row('height', '3D', 'Equipment height', anyHeight ? 'partial' : 'gap', 'The plan footprint is on the drawing. Equipment height is not, unless a piece already carries heightFt, so a 3D view has no stored height.'),
      row('demolition', 'E1.2', 'Demolition', 'gap', 'No demolition is drawn.'),
      row('signage', 'E3', 'Signage', 'gap', 'No signage is drawn.'),
      row('placards', 'E4', 'POI placards', 'gap', 'No placards are drawn.'),
      row('structural-pad', 'S1.1', 'Structural pad and piers', 'gap', 'The equipment footprint is not a pad section or a pier schedule.'),
      row('grounding', 'S2', 'Grounding', 'gap', 'No grounding is drawn.'),
      row('fence', 'S3', 'Fence', site.fences.length ? 'on-drawing' : 'gap', site.fences.length ? 'A fence is on the drawing.' : 'No fence is drawn.'),
      row('grid-atlas', 'Grid', 'Grid Atlas', 'gap', 'Grid Atlas is a map layer, off until it is switched on. The feeder, the substation, and the hosting figure are not copied onto the drawing. The verdict is the server\'s.')
    ];
  }

  function fromDoc(doc) {
    D = D || root.OmegaEditorV2Doc;
    G = G || root.OmegaEditorV2Geom;
    doc = doc || {};
    var gear = equipmentOf(doc);
    var conduits = conduitsOf(doc, gear);
    var arrays = arraysOf(doc);
    var site = siteOf(doc);
    var parity = parityOf(site, gear, conduits, arrays);
    var gaps = [];
    var i;
    for (i = 0; i < parity.length; i++) if (parity[i].status === 'gap') gaps.push(parity[i].id);
    return {
      schema: SCHEMA,
      projectId: doc.projectId || null,
      name: doc.name || '',
      address: doc.address || '',
      anchor: doc.anchor ? { lat: doc.anchor.lat, lng: doc.anchor.lng } : null,
      build: doc.build ? copy(doc.build) : null,
      frame: 'x and y are the stored point. corners is the canvas footprint, and that footprint treats x and y as the center.',
      site: site,
      equipment: gear,
      conduits: conduits,
      arrays: arrays,
      oneLine: { nodes: nodesOf(gear), wires: wiresOf(conduits) },
      schedule: {
        equipment: gear.map(function (e) {
          return { id: e.id, role: e.role, key: e.key, label: e.label, kw: e.kw, kwh: e.kwh, w: e.w, h: e.h };
        }),
        conduits: conduits.map(function (c) {
          return { id: c.id, spec: c.spec, kind: c.kind, fromId: c.fromId, toId: c.toId };
        })
      },
      parity: parity,
      gaps: gaps
    };
  }

  function subscribe(fn) {
    if (typeof fn !== 'function') return function () {};
    listeners.push(fn);
    return function () {
      var i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
    };
  }
  function publish(model) {
    var i;
    for (i = 0; i < listeners.length; i++) {
      try { listeners[i](model); } catch (err) { /* a listener's error does not stop the others */ }
    }
    return model;
  }

  var api = {
    SCHEMA: SCHEMA,
    fromDoc: fromDoc,
    subscribe: subscribe,
    publish: publish,
    VERSION: 'editor-v2-design/1'
  };
  root.OmegaEditorV2Design = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : global);
