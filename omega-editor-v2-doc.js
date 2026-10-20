/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 *
 * omega-editor-v2-doc.js — the Site Plan document, its layers and its undo.
 *
 * Geometry stays in omega-editor-v2-geom.js. Customer stays in
 * omega-editor-v2-assign.js. This file is the drawing: entities, layers,
 * selection helpers and a snapshot undo stack. Array tables are computed
 * when asked, never stored, so undo stays the size of the drawing.
 */
(function (root) {
  'use strict';

  var G = root.OmegaEditorV2Geom || (typeof require === 'function' ? require('./omega-editor-v2-geom.js') : null);
  var A = root.OmegaEditorV2Assign || (typeof require === 'function' ? require('./omega-editor-v2-assign.js') : null);

  var SCHEMA = 'omega.editor-v2/1';
  var HISTORY_LIMIT = 80;

  var LAYERS = [
    { id: 'site', name: 'Site', color: '#1F4E79' },
    { id: 'setback', name: 'Setbacks', color: '#B45309' },
    { id: 'obstruction', name: 'Obstructions', color: '#B91C1C' },
    { id: 'array', name: 'Arrays', color: '#1D4ED8' },
    { id: 'equipment', name: 'Equipment', color: '#0F766E' },
    { id: 'conduit', name: 'Conduit', color: '#6D28D9' },
    { id: 'annotation', name: 'Notes', color: '#334155' },
    { id: 'dimension', name: 'Dimensions', color: '#0F172A' }
  ];

  var EQUIP = {
    bess:        { label: 'BESS', w: 20, h: 8, kw: 0, kwh: 0 },
    pcs:         { label: 'PCS / inverter', w: 8, h: 4, kw: 0, kwh: 0 },
    transformer: { label: 'Transformer', w: 8, h: 6, kw: 0, kwh: 0 },
    meter:       { label: 'Meter', w: 2, h: 1.5, kw: 0, kwh: 0 },
    poi:         { label: 'Point of interconnection', w: 4, h: 4, kw: 0, kwh: 0 },
    charger:     { label: 'EV charger', w: 3, h: 2, kw: 0, kwh: 0 },
    bollard:     { label: 'Bollard', w: 0.5, h: 0.5, kw: 0, kwh: 0 }
  };

  function uid(prefix) {
    var s = '', i;
    for (i = 0; i < 12; i++) s += Math.floor(Math.random() * 16).toString(16);
    return (prefix || 'e') + '_' + s;
  }
  function clone(v) { return JSON.parse(JSON.stringify(v)); }
  function layers() {
    return LAYERS.map(function (l) {
      return { id: l.id, name: l.name, color: l.color, visible: true, locked: false };
    });
  }
  function layerById(doc, id) {
    var i, list = doc.layers || [];
    for (i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  function find(doc, id) {
    var i, list = doc.entities || [];
    for (i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function create(seed) {
    seed = seed || {};
    var doc = {
      schema: SCHEMA,
      projectId: seed.projectId || uid('p'),
      remoteProjectId: seed.remoteProjectId || null,
      orgId: seed.orgId || null,
      workspaceRevision: seed.workspaceRevision || 0,
      name: seed.name || 'Untitled site',
      address: seed.address || '',
      anchor: seed.anchor || { lat: 41.8781, lng: -87.6298 },
      gridFt: seed.gridFt > 0 ? seed.gridFt : 5,
      angleStep: 90,
      layers: seed.layers || layers(),
      entities: seed.entities || [],
      assignment: A.normalize(seed.assignment || A.empty())
    };
    /* A guided build's electrical record, title-block facts and kind
       travel with the document. Dropping them on restore would make the
       next permit set forget what the build just wrote. */
    ['screen','billKwh','billName','costTotal','revenueYear1','netCost','siteScreen','designVerified','valueStack','grid','milestones','costLines','solarDesign','state','city','zip'].forEach(function (key) {
      if (seed[key] !== undefined) doc[key] = clone(seed[key]);
    });
    if (seed.electrical) doc.electrical = clone(seed.electrical);
    if (seed.drawing) doc.drawing = clone(seed.drawing);
    if (seed.guided) doc.guided = clone(seed.guided);
    return doc;
  }

  function createState(doc) {
    return {
      doc: doc || create(),
      past: [],
      future: [],
      selection: []
    };
  }

  function commit(state, doc, selection) {
    state.past.push(clone(state.doc));
    if (state.past.length > HISTORY_LIMIT) state.past.shift();
    state.future = [];
    state.doc = doc;
    if (selection) state.selection = selection.slice();
    return state;
  }
  /* Undo and redo swap a clone of the whole document: entities of every
     type (including conduit runs), layers, and the customer assignment.
     A redo must not restore one list and leave another behind. */
  function undo(state) {
    if (!state.past.length) return false;
    state.future.push(clone(state.doc));
    state.doc = state.past.pop();
    state.selection = [];
    return true;
  }
  function redo(state) {
    if (!state.future.length) return false;
    state.past.push(clone(state.doc));
    state.doc = state.future.pop();
    state.selection = [];
    return true;
  }

  function withEntities(doc, entities) {
    var next = clone(doc);
    next.entities = entities;
    return next;
  }

  function add(state, entity) {
    var doc = clone(state.doc);
    entity = clone(entity);
    if (!entity.id) entity.id = uid('e');
    doc.entities.push(entity);
    commit(state, doc, [entity.id]);
    return entity.id;
  }
  function patch(state, id, fields) {
    var doc = clone(state.doc), i, hit = false;
    for (i = 0; i < doc.entities.length; i++) {
      if (doc.entities[i].id === id) {
        var k;
        for (k in fields) if (fields.hasOwnProperty(k)) doc.entities[i][k] = fields[k];
        hit = true;
      }
    }
    if (!hit) return false;
    commit(state, doc, state.selection.slice());
    return true;
  }
  function remove(state, ids) {
    var drop = {}, i, next = [];
    for (i = 0; i < ids.length; i++) drop[ids[i]] = true;
    for (i = 0; i < state.doc.entities.length; i++) if (!drop[state.doc.entities[i].id]) next.push(clone(state.doc.entities[i]));
    commit(state, withEntities(state.doc, next), []);
    return true;
  }
  function replaceAll(state, entities, selection) {
    commit(state, withEntities(state.doc, entities), selection || state.selection);
  }

  function groupIds(doc, ids) {
    var wanted = {}, i, e, gid, extra = {};
    for (i = 0; i < ids.length; i++) wanted[ids[i]] = true;
    for (i = 0; i < doc.entities.length; i++) {
      e = doc.entities[i];
      if (wanted[e.id] && e.groupId) extra[e.groupId] = true;
    }
    for (i = 0; i < doc.entities.length; i++) {
      e = doc.entities[i];
      if (e.groupId && extra[e.groupId]) wanted[e.id] = true;
    }
    var out = [];
    for (gid in wanted) if (wanted.hasOwnProperty(gid)) out.push(gid);
    return out;
  }

  function applyShift(state, ids, fn) {
    var want = {}, i, list;
    ids = groupIds(state.doc, ids);
    for (i = 0; i < ids.length; i++) want[ids[i]] = true;
    list = state.doc.entities.map(function (e) {
      if (!want[e.id]) return clone(e);
      var layer = layerById(state.doc, e.layer);
      if (layer && layer.locked) return clone(e);
      return fn(clone(e));
    });
    replaceAll(state, list, ids);
  }
  function move(state, ids, dx, dy) {
    applyShift(state, ids, function (e) { return G.moveEntity(e, dx, dy); });
  }
  function rotate(state, ids, origin, degrees) {
    applyShift(state, ids, function (e) { return G.rotateEntity(e, origin, degrees); });
  }
  function duplicate(state, ids, dx, dy) {
    var want = {}, copies = [], i, e, idMap = {}, nid;
    ids = groupIds(state.doc, ids);
    for (i = 0; i < ids.length; i++) want[ids[i]] = true;
    var list = state.doc.entities.map(clone);
    for (i = 0; i < state.doc.entities.length; i++) {
      e = state.doc.entities[i];
      if (!want[e.id]) continue;
      nid = uid('e');
      idMap[e.id] = nid;
      var c = G.moveEntity(e, dx, dy);
      c.id = nid;
      copies.push(c);
    }
    for (i = 0; i < copies.length; i++) {
      if (copies[i].boundaryId && idMap[copies[i].boundaryId]) copies[i].boundaryId = idMap[copies[i].boundaryId];
      if (copies[i].groupId) copies[i].groupId = 'g_' + copies[i].groupId;
    }
    replaceAll(state, list.concat(copies), copies.map(function (c) { return c.id; }));
  }
  function group(state, ids) {
    if (!ids || ids.length < 2) return false;
    var gid = uid('g'), want = {}, list, i;
    for (i = 0; i < ids.length; i++) want[ids[i]] = true;
    list = state.doc.entities.map(function (e) {
      var c = clone(e);
      if (want[c.id]) c.groupId = gid;
      return c;
    });
    replaceAll(state, list, ids.slice());
    return gid;
  }
  function ungroup(state, ids) {
    var want = {}, gids = {}, i, e, list;
    ids = groupIds(state.doc, ids);
    for (i = 0; i < ids.length; i++) want[ids[i]] = true;
    for (i = 0; i < state.doc.entities.length; i++) {
      e = state.doc.entities[i];
      if (want[e.id] && e.groupId) gids[e.groupId] = true;
    }
    list = state.doc.entities.map(function (ent) {
      var c = clone(ent);
      if (c.groupId && gids[c.groupId]) c.groupId = null;
      return c;
    });
    replaceAll(state, list, ids);
  }
  function align(state, ids, mode) {
    var items = [], i, e, shifts, list, want = {};
    ids = groupIds(state.doc, ids);
    for (i = 0; i < ids.length; i++) {
      e = find(state.doc, ids[i]);
      if (e) items.push({ id: e.id, box: G.boundsOf(e) });
    }
    shifts = G.align(items, mode);
    for (i = 0; i < ids.length; i++) want[ids[i]] = true;
    list = state.doc.entities.map(function (ent) {
      if (!shifts[ent.id]) return clone(ent);
      return G.moveEntity(ent, shifts[ent.id].dx, shifts[ent.id].dy);
    });
    replaceAll(state, list, ids);
  }
  function distribute(state, ids, axis) {
    var items = [], i, shifts, list;
    ids = groupIds(state.doc, ids);
    for (i = 0; i < ids.length; i++) {
      var e = find(state.doc, ids[i]);
      if (e) items.push({ id: e.id, box: G.boundsOf(e) });
    }
    shifts = G.distribute(items, axis);
    list = state.doc.entities.map(function (ent) {
      if (!shifts[ent.id]) return clone(ent);
      return G.moveEntity(ent, shifts[ent.id].dx, shifts[ent.id].dy);
    });
    replaceAll(state, list, ids);
  }

  function exclusions(doc) {
    var out = [], i, e, ring;
    for (i = 0; i < doc.entities.length; i++) {
      e = doc.entities[i];
      if (e.type !== 'obstruction') continue;
      var layer = layerById(doc, e.layer);
      if (layer && layer.visible === false) continue;
      ring = G.ringOf(e);
      if (ring) out.push(ring);
    }
    return out;
  }
  function boundaryEntity(doc, arrayEnt) {
    if (arrayEnt.boundaryId) return find(doc, arrayEnt.boundaryId);
    return arrayEnt;
  }
  function arrayLayout(doc, arrayEnt) {
    var host = boundaryEntity(doc, arrayEnt);
    var ring = host ? G.ringOf(host) : null;
    if (!ring) return { ok: false, reason: 'The boundary for this array is missing.' };
    var layout = G.fillTables(ring, exclusions(doc), {
      mount: arrayEnt.mount || 'fixed-ground',
      setbackFt: arrayEnt.setbackFt,
      gcr: arrayEnt.gcr,
      tableW: arrayEnt.tableW,
      tableH: arrayEnt.tableH,
      maxKwDc: arrayEnt.maxKwDc
    });
    if (!layout.ok) return layout;
    if (arrayEnt.kwOverride > 0) {
      layout.kw = Math.round(+arrayEnt.kwOverride * 10) / 10;
      layout.kwAc = Math.round(layout.kw / G.DC_AC);
      layout.kwSource = 'entered';
    } else layout.kwSource = 'modules';
    return layout;
  }

  function summary(doc) {
    var solarKw = 0, solarAc = 0, tables = 0, modules = 0, arrays = 0;
    var bessKw = 0, bessKwh = 0, bessN = 0, chargers = 0, chargerKw = 0, derKw = 0, one;
    var i, e, lay;
    for (i = 0; i < doc.entities.length; i++) {
      e = doc.entities[i];
      if (e.type === 'array') {
        lay = arrayLayout(doc, e);
        if (lay.ok) {
          arrays++;
          solarKw += lay.kw;
          solarAc += lay.kwAc;
          tables += lay.tableCount;
          modules += lay.moduleCount;
        }
      } else if (e.type === 'equip' && e.key === 'bess') {
        bessN++;
        bessKw += +e.kw || 0;
        bessKwh += +e.kwh || 0;
      } else if (e.type === 'equip' && e.key === 'charger') {
        chargers++;
        chargerKw += +e.kw || 0;
      } else if ((e.type === 'equip' || e.type === 'rect') && (e.key === 'pv' || e.key === 'wind' || e.key === 'genset')) {
        one = +e.kw || +e.derKw || 0;
        derKw += one;
        if (e.key === 'pv') solarKw += one;
      }
    }
    return {
      solarKwDc: Math.round(solarKw * 10) / 10,
      solarKwAc: Math.round(solarAc),
      tableCount: tables,
      moduleCount: modules,
      arrayCount: arrays,
      bessKw: bessKw,
      bessKwh: bessKwh,
      bessCount: bessN,
      chargerCount: chargers,
      chargerKw: chargerKw,
      derKw: derKw,
      entityCount: doc.entities.length
    };
  }

  function setMeta(state, fields) {
    var doc = clone(state.doc), k;
    for (k in fields) if (fields.hasOwnProperty(k) && k !== 'entities' && k !== 'schema') doc[k] = fields[k];
    if (fields.assignment) doc.assignment = A.normalize(fields.assignment);
    commit(state, doc, state.selection.slice());
  }

  function serialize(doc) { return clone(doc); }
  function restore(raw) {
    if (!raw || raw.schema !== SCHEMA) throw new Error('This file is not an OMEGA Site Plan.');
    var doc = create(raw);
    doc.projectId = raw.projectId || doc.projectId;
    doc.entities = clone(raw.entities || []);
    doc.layers = raw.layers && raw.layers.length ? clone(raw.layers) : layers();
    doc.assignment = A.normalize(raw.assignment || A.empty());
    return doc;
  }

  var api = {
    SCHEMA: SCHEMA,
    LAYERS: LAYERS,
    EQUIP: EQUIP,
    uid: uid,
    clone: clone,
    create: create,
    createState: createState,
    commit: commit,
    undo: undo,
    redo: redo,
    add: add,
    patch: patch,
    remove: remove,
    move: move,
    rotate: rotate,
    duplicate: duplicate,
    group: group,
    ungroup: ungroup,
    align: align,
    distribute: distribute,
    groupIds: groupIds,
    find: find,
    layerById: layerById,
    arrayLayout: arrayLayout,
    summary: summary,
    setMeta: setMeta,
    serialize: serialize,
    restore: restore,
    VERSION: 'editor-v2-doc/1'
  };
  root.OmegaEditorV2Doc = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : global);
