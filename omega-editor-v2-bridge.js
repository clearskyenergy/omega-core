/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 *
 * omega-editor-v2-bridge.js — a Site Plan as the project record Site Map reads.
 *
 * Downstream tools do not read this editor. They read a project:
 *   shapes[]   kind 'dersolar' with kw, tableCount, boundary, sqft
 *   elements[] equipment blocks (bess-asm, eqId 'charger', …)
 *   bessList[] the fleet omegaBessFleet falls back to
 *   conduits[]
 *   mapState   lat, lng, pxPerFt, canvas size
 *   pxPerFt, unitLabel, address, name, type, siteScopes, client
 *
 * The feet drawing is also stored as editorV2 so a round trip does not
 * go back through pixels. client is the legacy company string, written
 * from the assignment so the project list and the customer agree.
 *
 * Nothing here is a price. Capacity is the module rule in the geometry
 * file. A Firestore write of the drawing keys still has to carry savedBy
 * (firestore.rules drawingWriteAllowed); withSavedBy() adds it. This
 * module never opens a database.
 */
(function (root) {
  'use strict';

  var G = root.OmegaEditorV2Geom || require('./omega-editor-v2-geom.js');
  var D = root.OmegaEditorV2Doc || require('./omega-editor-v2-doc.js');
  var A = root.OmegaEditorV2Assign || require('./omega-editor-v2-assign.js');

  /* Fixed export scale. Readers divide pixels by pxPerFt and get feet back. */
  var PPF = 2;
  var MARGIN_FT = 40;

  /* Same precedence as OmegaNewProject.SCOPES. The stored `type` is the
     legacy string (der → solar), which the project charts already use. */
  var SCOPE_ORDER = [
    { key: 'der', legacy: 'solar' },
    { key: 'bess', legacy: 'bess' },
    { key: 'compute', legacy: 'compute' },
    { key: 'dcfc', legacy: 'dcfc' },
    { key: 'l2', legacy: 'l2' },
    { key: 'microgrid', legacy: 'microgrid' },
    { key: 'building', legacy: 'building' }
  ];

  function scopesOf(doc) {
    var have = {}, i, e, out = [];
    for (i = 0; i < doc.entities.length; i++) {
      e = doc.entities[i];
      if (e.type === 'array') have.der = true;
      if (e.type === 'equip' && e.key === 'bess') have.bess = true;
      if (e.type === 'equip' && e.key === 'charger') {
        if ((+e.kw || 0) >= 50) have.dcfc = true;
        else have.l2 = true;
      }
    }
    for (i = 0; i < SCOPE_ORDER.length; i++) if (have[SCOPE_ORDER[i].key]) out.push(SCOPE_ORDER[i].key);
    return out;
  }
  function primaryType(scopes) {
    var i, j;
    for (i = 0; i < SCOPE_ORDER.length; i++) {
      for (j = 0; j < scopes.length; j++) if (scopes[j] === SCOPE_ORDER[i].key) return SCOPE_ORDER[i].legacy;
    }
    return 'bess';
  }

  function extremes(doc) {
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, i, b, any = false;
    for (i = 0; i < doc.entities.length; i++) {
      b = G.boundsOf(doc.entities[i]);
      if (!(b.w || b.h) && b.minX === 0 && b.maxX === 0 && b.minY === 0 && b.maxY === 0) continue;
      any = true;
      if (b.minX < minX) minX = b.minX;
      if (b.minY < minY) minY = b.minY;
      if (b.maxX > maxX) maxX = b.maxX;
      if (b.maxY > maxY) maxY = b.maxY;
    }
    if (!any) { minX = 0; minY = 0; maxX = 200; maxY = 120; }
    return {
      minX: minX - MARGIN_FT, minY: minY - MARGIN_FT,
      maxX: maxX + MARGIN_FT, maxY: maxY + MARGIN_FT
    };
  }
  function worldToPx(p, frame) {
    return {
      x: Math.round((p.x - frame.minX) * PPF * 100) / 100,
      y: Math.round((frame.maxY - p.y) * PPF * 100) / 100
    };
  }
  function pxToWorld(p, frame) {
    return {
      x: frame.minX + p.x / PPF,
      y: frame.maxY - p.y / PPF
    };
  }

  function project(doc) {
    var frame = extremes(doc);
    var canvasW = Math.round((frame.maxX - frame.minX) * PPF);
    var canvasH = Math.round((frame.maxY - frame.minY) * PPF);
    var shapes = [], elements = [], conduits = [], bessList = [];
    var i, e, lay, ring, pts, bb, tables, t, sw, sh, top, fields, scopes, takeoff, zoom;

    for (i = 0; i < doc.entities.length; i++) {
      e = doc.entities[i];
      if (e.type === 'array') {
        lay = D.arrayLayout(doc, e);
        if (!lay.ok) continue;
        ring = G.ringOf(D.find(doc, e.boundaryId) || e) || [];
        pts = ring.map(function (p) { return worldToPx(p, frame); });
        bb = G.bbox(pts);
        tables = lay.densityOnly ? [] : lay.tables.map(function (tb) {
          top = worldToPx({ x: tb.x, y: tb.y + tb.h }, frame);
          return { x: top.x, y: top.y, w: +(tb.w * PPF).toFixed(2), h: +(tb.h * PPF).toFixed(2) };
        });
        shapes.push({
          id: e.id, kind: 'dersolar', mount: e.mount === 'rooftop' ? 'roof' : (e.mount === 'carport' ? 'adjacent' : 'ground'),
          canopy: e.mount === 'carport',
          autoLayout: true,
          pts: [{ x: bb.minX, y: bb.minY }],
          wPx: bb.w, hPx: bb.h,
          boundary: pts,
          tables: tables,
          tableCount: lay.tableCount, rowCount: lay.rowCount,
          pitchFt: lay.pitchFt, tableWft: lay.tableWft, tableHft: lay.tableHft,
          densityOnly: lay.densityOnly,
          kw: lay.kw, kwAc: lay.kwAc, dcAcRatio: lay.dcAcRatio,
          gcr: lay.gcr, setbackFt: lay.setbackFt,
          sqft: lay.sqft, moduleSqft: lay.moduleSqft,
          kwSource: lay.kwSource,
          _ppfAt: PPF, scaled: true,
          product: { mfr: G.MODULE.mfr, make: G.MODULE.make, line: G.MODULE.line, sku: G.MODULE.sku, key: G.MODULE.key }
        });
      } else if (e.type === 'equip') {
        sw = (+e.w || 0); sh = (+e.h || 0);
        top = worldToPx({ x: e.x - sw / 2, y: e.y + sh / 2 }, frame);
        if (e.key === 'bess') {
          elements.push({
            id: e.id, type: 'bess-asm', label: e.label || 'BESS',
            x: top.x, y: top.y, w: sw * PPF, h: sh * PPF, rot: e.rot || 0,
            kw: +e.kw || 0, kwh: +e.kwh || 0,
            spec: ((+e.kw || 0) + ' kW · ' + (+e.kwh || 0) + ' kWh')
          });
          bessList.push({ id: e.id, name: e.label || 'BESS', qty: 1, kw: +e.kw || 0, kwh: +e.kwh || 0 });
        } else {
          elements.push({
            id: e.id, type: 'eq', eqId: e.key === 'charger' ? 'charger' : (e.key || 'eq'),
            label: e.label || e.key, x: top.x, y: top.y, w: Math.max(sw * PPF, 8), h: Math.max(sh * PPF, 8),
            rot: e.rot || 0, kw: +e.kw || 0,
            spec: e.key === 'charger' && e.kw ? (e.kw + ' kW') : (e.label || '')
          });
        }
      } else if (e.type === 'conduit' && e.pts && e.pts.length > 1) {
        conduits.push({
          id: e.id, type: e.spec || 'RMC',
          pts: e.pts.map(function (p) { return worldToPx(p, frame); }),
          ftLen: +G.polylineLength(e.pts).toFixed(1)
        });
      } else if ((e.type === 'polygon' || e.type === 'polyline' || e.type === 'line' || e.type === 'rect') && e.layer === 'site') {
        ring = e.type === 'line' ? [e.a, e.b] : (e.type === 'rect' ? G.rectCorners(e) : (e.pts || []));
        shapes.push({
          id: e.id,
          kind: e.type === 'line' ? 'line' : (e.closed || e.type === 'rect' || e.type === 'polygon' ? 'polyline' : 'polyline'),
          pts: ring.filter(Boolean).map(function (p) { return worldToPx(p, frame); }),
          closed: !!(e.closed || e.type === 'rect' || e.type === 'polygon')
        });
      }
    }

    fields = A.toProjectFields(doc.assignment);
    scopes = scopesOf(doc);
    takeoff = D.summary(doc);
    zoom = Math.round(G.zoomForScale(doc.anchor.lat, PPF));
    var out = {
      schema: 'omega.project/1',
      editor: 'v2',
      projectId: doc.projectId,
      remoteProjectId: doc.remoteProjectId || null,
      orgId: doc.orgId || null,
      name: doc.name || 'Untitled site',
      address: doc.address || '',
      type: primaryType(scopes),
      siteScopes: scopes,
      stage: 'candidate',
      client: fields.client,
      assignment: fields.assignment,
      elements: elements,
      shapes: shapes,
      conduits: conduits,
      bessList: bessList,
      pxPerFt: PPF,
      unitLabel: 'ft',
      mapState: {
        lat: doc.anchor.lat, lng: doc.anchor.lng,
        address: doc.address || '',
        pxPerFt: PPF,
        zoom: zoom,
        canvasW: canvasW, canvasH: canvasH,
        mode: 'editor-v2',
        frame: frame
      },
      takeoff: takeoff,
      editorV2: D.serialize(doc)
    };
    var cost = doc.costRun, vs = doc.valueStack;
    if (cost && cost.total > 0) {
      out.capex = cost.total;
      out.capexAt = cost.at || null;
      out.capexSource = 'site-plan';
      if (takeoff.bessKw > 0) { out.bessKw = takeoff.bessKw; out.bessKwh = takeoff.bessKwh; }
      if (vs && vs.incentiveUsd != null) out.incentive = vs.incentiveUsd;
      if (vs && vs.owner != null) out.annualRevenue = vs.owner;
    }
    return out;
  }

  /* A drawing write into projects/{id} is refused without savedBy.
     The caller supplies who, which tab and when. This does not write. */
  function withSavedBy(record, by) {
    var out = JSON.parse(JSON.stringify(record));
    by = by || {};
    if (!by.tab || typeof by.at !== 'number') {
      throw new Error('A drawing save needs savedBy.tab and savedBy.at.');
    }
    out.savedBy = {
      email: String(by.email || '').toLowerCase(),
      tab: String(by.tab),
      ua: String(by.ua || '').slice(0, 120),
      at: by.at
    };
    return out;
  }

  function fromRecord(record) {
    if (record && record.editorV2 && record.editorV2.schema === D.SCHEMA) {
      var doc = D.restore(record.editorV2);
      var read = A.fromProject(record);
      if (record.remoteProjectId) doc.remoteProjectId = record.remoteProjectId;
      if (record.orgId) doc.orgId = record.orgId;
      doc.clientDrift = !!read.clientDrift;
      delete read.clientDrift;
      doc.assignment = read;
      return doc;
    }
    throw new Error('This project has no Omega Maximus drawing to open.');
  }

  var api = {
    PPF: PPF,
    SCOPE_ORDER: SCOPE_ORDER,
    scopesOf: scopesOf,
    primaryType: primaryType,
    project: project,
    withSavedBy: withSavedBy,
    fromRecord: fromRecord,
    worldToPx: worldToPx,
    pxToWorld: pxToWorld,
    VERSION: 'editor-v2-bridge/1'
  };
  root.OmegaEditorV2Bridge = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : global);
