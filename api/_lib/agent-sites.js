/* ═══════════════════════════════════════════════════════════════════════════════
   api/_lib/agent-sites.js — the site record as an agent sees it, and back
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   PURE. No Firestore, no HTTP: every function here takes plain objects and
   returns plain objects, so scripts/test-agent-sites.js can run it with no
   credential. The endpoints in api/agent/ do the reading and writing.

   THE RECORD IS A DEAL. A "site" in the OSA portfolio is a document in the
   `deals` collection (tenants/osa/portfolio-data.js is its schema and the
   reason for every field). This file does not invent a second collection:
   a site the agent uploads lands where the portfolio, the matrix and the
   verification console already look. What it adds is ONE block —

     outline: { ring:[[lng,lat],…], acres, centroid:[lng,lat], source,
                fileName, tracedAt, by, features:[{type,kind,name,coords}] }

   — which the portfolio never persisted (it scored the KMZ and kept the score,
   not the shape). The agent needs the shape to hand a KMZ back, so it is
   stored on the deal, next to `grid`, in the same [lng,lat] order
   omega-site-intel.js reads off the file.

   WHAT "LARGER" MEANS. Acres first, MW second. A site with a traced ring has
   a measured acreage; one with only a pin has none, and sorting by acreage
   alone would bury a 200 MW site that nobody has drawn yet. So the sort key
   is (acres, sizeMw) and the filters are minAcres / minMw, either or both.

   WHAT AN UPDATE MAY NOT TOUCH. origination, funding, stage, viability. Those
   carry the attribution and money decisions the portfolio locks on purpose
   (see the four decisions at the top of portfolio-data.js); a machine with a
   key does not get to move them. It may add an outline, fill a blank size or
   address, and append a note. That is the whole write surface.
   ═══════════════════════════════════════════════════════════════════════════════ */
'use strict';
/* A STATIC path on purpose: Vercel bundles a function by tracing its
   require() calls, and a path built at runtime is invisible to that trace —
   the deploy would then 500 with "Cannot find module" on the first call.
   vercel.json also lists the file under includeFiles for api/agent/*. */
var SI = require('../../omega-site-intel.js');

var MAX_RING_POINTS = 2000;

function num(v) { if (v === '' || v == null) return null; var n = Number(v); return isFinite(n) ? n : null; }
function str(v) { return String(v == null ? '' : v).trim(); }
function lower(v) { return str(v).toLowerCase(); }
function stamp() { return new Date().toISOString(); }
function round6(n) { return Math.round(n * 1e6) / 1e6; }

/* Same key the OSA importer uses to spot a duplicate: name|address, letters
   and digits only. Two rows that differ by punctuation are one site. */
function normKey(name, addr) {
  var s = (str(name) + '|' + str(addr)).toLowerCase().replace(/[^a-z0-9|]+/g, '');
  return s === '|' ? '' : s;
}

/* ── coordinates ───────────────────────────────────────────────────────── */
/* Accepts [[lng,lat],…], [[lat,lng],…] (detected: a latitude cannot exceed
   90, and every longitude in the Americas is beyond -60), or [{lat,lng},…].
   Returns a closed [lng,lat] ring, or null when there is no polygon in it. */
function toRing(input) {
  if (!Array.isArray(input) || input.length < 3) return null;
  var pts = [], latFirst = null;
  for (var i = 0; i < input.length; i++) {
    var p = input[i], lng, lat;
    if (p && typeof p === 'object' && !Array.isArray(p)) { lng = num(p.lng != null ? p.lng : p.lon); lat = num(p.lat); }
    else if (Array.isArray(p) && p.length >= 2) {
      var a = num(p[0]), b = num(p[1]);
      if (a == null || b == null) return null;
      if (latFirst === null) latFirst = Math.abs(a) <= 90 && Math.abs(b) > 90 ? true
                                     : Math.abs(b) <= 90 && Math.abs(a) > 90 ? false : null;
      if (latFirst === true) { lat = a; lng = b; } else { lng = a; lat = b; }
    } else return null;
    if (lng == null || lat == null || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    pts.push([round6(lng), round6(lat)]);
  }
  if (pts.length > MAX_RING_POINTS) return null;
  var f = pts[0], z = pts[pts.length - 1];
  if (f[0] !== z[0] || f[1] !== z[1]) pts.push([f[0], f[1]]);
  if (pts.length < 4) return null;
  return pts;
}

function centroidOf(ring) {
  var x = 0, y = 0, n = 0;
  for (var i = 0; i < ring.length - 1; i++) { x += ring[i][0]; y += ring[i][1]; n++; }
  return n ? [round6(x / n), round6(y / n)] : null;
}

/* KML text → { outline, grid } using the same engine the portfolio uses in
   the browser: SI.outline() keeps the shape, SI.gridScore() ranks it, and
   `grid` is written in the shape Portfolio.saveGrid stores. */
function outlineFromKML(text, siteName, meta) {
  meta = meta || {};
  var parsed = SI.parseKML(text);
  if (!parsed.features.length) return { error: parsed.errors[0] || 'no placemarks in that file' };
  var s = SI.intake(parsed.features, siteName || '');
  var outline = SI.outline(s, { source: meta.source || 'kml', fileName: meta.fileName, by: meta.by });
  if (!outline) return { error: 'that file has no polygon, line or point with coordinates' };
  var grid = null;
  if (s.transmission.length || s.substations.length) {
    var g = SI.gridScore(s, { targetMw: meta.targetMw || null });
    grid = gridRecord(s, g, outline.fileName, meta.by);
  }
  return { outline: outline, grid: grid, intake: s };
}

/* Mirrors _kmzToGrid() in tenants/osa/portfolio.html so a score written by
   the agent looks exactly like one written from the portfolio's KMZ button. */
function gridRecord(intake, g, fileName, by) {
  var subs = (intake.substations || []).map(function (P) {
    return { name: P.name || 'Substation', voltageKv: P.attrs.kv || null, owner: P.attrs.owner || '',
             distanceKm: P.distM != null ? Math.round(P.distM / 10) / 100 : null };
  });
  var lines = (intake.transmission || []).map(function (L) {
    return { name: L.name || '', voltageKv: L.attrs.kv || null, circuits: L.attrs.circuits || 1,
             owner: L.attrs.owner || '', distanceKm: L.distM != null ? Math.round(L.distM / 10) / 100 : null };
  });
  var findings = (intake.flags || []).map(function (f) {
    return { severity: f.level === 'error' ? 'blocker' : f.level === 'warn' ? 'risk' : 'note', text: f.msg };
  });
  findings.push({ severity: 'note', text: 'Measured from traced geometry, not from utility data. It cannot see queue position, thermal ratings or ATC.' });
  var c = outline_centroid(intake);
  return {
    score: g.score, ranAt: stamp(), ranBy: by || 'agent', source: 'site-intel',
    lat: c ? c[1] : null, lng: c ? c[0] : null, resolvedAddress: '', geocode: null,
    substations: subs, lines: lines, plants: [], findings: findings,
    summary: 'Site intel ' + g.score + '/100 (' + g.confidence + ' confidence) from ' + (fileName || 'a traced file') +
             (g.kv ? ', ' + g.kv + ' kV' : '') + (g.poiMi != null ? ', POI ' + g.poiMi + ' mi' : ''),
    raw: { engine: SI.VERSION, confidence: g.confidence, components: g.components, missing: g.missing,
           mwHostable: g.mwHostable, mwCeiling: g.mwCeiling, kv: g.kv, poiMi: g.poiMi, poiVia: g.poiVia, evidence: g.evidence }
  };
}
function outline_centroid(intake) {
  var r = (intake.parcelRings || [])[0];
  return r ? centroidOf(toRing(r.coords) || r.coords) : null;
}

/* A hand-supplied outline from the request body: a ring, or a KML string.
   Returns { outline, grid } or { error }. */
function outlineFromInput(site, meta) {
  meta = meta || {};
  if (site.kml) return outlineFromKML(String(site.kml), site.name, { source: 'agent-kml', fileName: site.fileName || 'agent.kml', by: meta.by, targetMw: num(site.sizeMw) });
  var raw = site.outline && !Array.isArray(site.outline) ? site.outline.ring : site.outline;
  if (raw == null) return { outline: null, grid: null };
  var ring = toRing(raw);
  if (!ring) return { error: 'outline must be a polygon of at least 3 [lng,lat] points, at most ' + MAX_RING_POINTS };
  return { outline: {
    ring: ring, acres: Math.round(SI.geo.areaAcres(ring) * 10) / 10, statedAcres: num(site.acres),
    centroid: centroidOf(ring), source: 'agent', fileName: '', tracedAt: stamp(), by: str(meta.by).slice(0, 120),
    features: [], flags: []
  }, grid: null };
}

/* ── the deal, as the agent sees it ────────────────────────────────────── */
function acresOf(d) {
  var o = d.outline || {};
  if (o.acres != null) return num(o.acres);
  if (o.statedAcres != null) return num(o.statedAcres);
  return num(d.acres);
}
function pointOf(d) {
  var o = d.outline || {}, g = d.grid || {};
  if (o.centroid && o.centroid.length === 2) return { lat: o.centroid[1], lng: o.centroid[0], from: 'outline' };
  if (num(g.lat) != null && num(g.lng) != null) return { lat: num(g.lat), lng: num(g.lng), from: 'grid' };
  return null;
}
function summary(id, d) {
  d = d || {};
  var o = d.origination || {}, v = d.viability || {}, g = d.grid || {}, out = d.outline || null, p = pointOf(d);
  return {
    id: id,
    name: d.name || 'Untitled site',
    address: d.address || '',
    state: d.state || '',
    stage: d.stage || 'referred',
    projectType: d.projectType || '',
    partnerOrg: lower(o.partnerOrg),
    partnerName: o.partnerName || '',
    sizeMw: num(d.sizeMw),
    sizeMwh: num(d.sizeMwh),
    acres: acresOf(d),
    lat: p ? p.lat : null,
    lng: p ? p.lng : null,
    gridScore: num(g.score),
    gridSummary: g.summary || '',
    viabilityScore: num(v.score),
    viabilityVerdict: v.verdict || '',
    hasOutline: !!(out && out.ring && out.ring.length >= 4),
    outlineSource: out ? (out.source || '') : '',
    outlineTracedAt: out ? (out.tracedAt || null) : null,
    externalId: (d.externalIds || {}).agent || '',
    siteNotes: str(d.siteNotes).slice(0, 500),
    updatedAt: d.updatedAt || null,
    createdAt: d.createdAt || null
  };
}

/* The full record for one site: the summary plus the outline itself. */
function detail(id, d) {
  var s = summary(id, d), out = (d || {}).outline || null;
  s.outline = out ? {
    ring: out.ring || null, acres: out.acres != null ? out.acres : null, statedAcres: out.statedAcres != null ? out.statedAcres : null,
    centroid: out.centroid || null, source: out.source || '', fileName: out.fileName || '', tracedAt: out.tracedAt || null,
    features: (out.features || []).map(function (f) { return { type: f.type, kind: f.kind, name: f.name, kv: f.kv || null, owner: f.owner || '', points: (f.coords || []).length }; }),
    flags: out.flags || []
  } : null;
  s.grid = (d && d.grid && d.grid.ranAt) ? {
    score: num(d.grid.score), source: d.grid.source || '', ranAt: d.grid.ranAt, summary: d.grid.summary || '',
    substations: d.grid.substations || [], lines: d.grid.lines || [], findings: d.grid.findings || []
  } : null;
  return s;
}

/* The KML input for api/_lib/kmz.js, from a deal. */
function kmlSite(id, d) {
  d = d || {};
  var out = d.outline || {}, p = pointOf(d), s = summary(id, d);
  var desc = [s.address, s.sizeMw != null ? s.sizeMw + ' MW' : '', s.acres != null ? Math.round(s.acres) + ' acres' : '',
              s.gridScore != null ? 'grid ' + s.gridScore + '/100' : '', 'stage ' + s.stage,
              'OMEGA deal ' + id].filter(Boolean).join(' · ');
  return { name: s.name, description: desc, ring: out.ring || null, acres: out.acres || null,
           point: p ? [p.lng, p.lat] : null, features: out.features || [] };
}

/* ── listing ───────────────────────────────────────────────────────────── */
var DEAD_STAGES = ['dead', 'discarded', 'parked'];
function filterAndSort(sites, q) {
  q = q || {};
  var minAcres = num(q.minAcres), minMw = num(q.minMw), stage = lower(q.stage), state = str(q.state).toUpperCase();
  var since = q.since ? Date.parse(q.since) : NaN, includeDead = q.includeDead === true || q.includeDead === 'true' || q.includeDead === '1';
  var outlineOnly = q.hasOutline === true || q.hasOutline === 'true' || q.hasOutline === '1';
  var out = sites.filter(function (s) {
    if (!includeDead && DEAD_STAGES.indexOf(s.stage) >= 0) return false;
    if (stage && s.stage !== stage) return false;
    if (state && s.state !== state) return false;
    if (outlineOnly && !s.hasOutline) return false;
    if (minAcres != null && !(s.acres != null && s.acres >= minAcres)) return false;
    if (minMw != null && !(s.sizeMw != null && s.sizeMw >= minMw)) return false;
    if (!isNaN(since) && !(s.updatedAt && Date.parse(s.updatedAt) >= since)) return false;
    return true;
  });
  out.sort(function (a, b) {
    var aa = a.acres != null ? a.acres : -1, ba = b.acres != null ? b.acres : -1;
    if (ba !== aa) return ba - aa;
    var am = a.sizeMw != null ? a.sizeMw : -1, bm = b.sizeMw != null ? b.sizeMw : -1;
    if (bm !== am) return bm - am;
    return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
  });
  var limit = Math.max(1, Math.min(200, num(q.limit) || 50));
  return { total: out.length, sites: out.slice(0, limit) };
}

/* ── writing ───────────────────────────────────────────────────────────── */
function stateFromAddress(a) {
  var s = str(a); if (!s) return '';
  var m = /\b([A-Z]{2})\b(?:\s+\d{5}(?:-\d{4})?)?\s*(?:,\s*(?:USA|US|United States))?\s*$/i.exec(s);
  return m ? m[1].toUpperCase() : '';
}
function entry(type, message, by) {
  return { ts: stamp(), type: type, message: message, actor: by || 'agent', actorEmail: '' };
}

/* Validate one site from a POST body. Returns { ok:true, site } or { ok:false, error }. */
function validateSite(raw) {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'each site must be an object' };
  var name = str(raw.name).slice(0, 160);
  if (!name) return { ok: false, error: 'name is required' };
  var lat = num(raw.lat), lng = num(raw.lng);
  if ((lat != null) !== (lng != null)) return { ok: false, error: 'lat and lng go together' };
  if (lat != null && (Math.abs(lat) > 90 || Math.abs(lng) > 180)) return { ok: false, error: 'lat/lng out of range' };
  var sizeMw = num(raw.sizeMw), acres = num(raw.acres);
  if (sizeMw != null && (sizeMw < 0 || sizeMw > 10000)) return { ok: false, error: 'sizeMw out of range' };
  if (acres != null && (acres < 0 || acres > 1000000)) return { ok: false, error: 'acres out of range' };
  if (raw.kml != null && (typeof raw.kml !== 'string' || raw.kml.length > 4000000)) return { ok: false, error: 'kml must be a string under 4 MB' };
  return { ok: true, site: {
    externalId: str(raw.externalId).slice(0, 120),
    name: name, address: str(raw.address).slice(0, 300), state: str(raw.state).toUpperCase().slice(0, 2) || stateFromAddress(raw.address),
    lat: lat, lng: lng, acres: acres, sizeMw: sizeMw, sizeMwh: num(raw.sizeMwh),
    projectType: lower(raw.projectType).replace(/[\s-]+/g, '_').slice(0, 40),
    notes: str(raw.notes).slice(0, 2000), fileName: str(raw.fileName).slice(0, 120),
    outline: raw.outline, kml: raw.kml, kmzBase64: raw.kmzBase64,
    contactName: str(raw.contactName).slice(0, 120), contactEmail: lower(raw.contactEmail).slice(0, 160)
  } };
}

/* A brand-new deal, field for field what Portfolio.create() writes, plus the
   outline and the agent's fingerprint. `caller` is the agent key's holder. */
function newDealDoc(site, caller, outline, grid, batch) {
  var partnerOrg = lower(caller.orgId), by = caller.label || 'agent';
  var doc = {
    schemaVersion: 1,
    name: site.name, address: site.address, state: site.state,
    clientOrgId: '', intakeId: '', importBatch: batch || '', projectId: '', verificationIds: [],
    origination: {
      partnerOrg: partnerOrg, partnerName: caller.partnerName || '', contactName: site.contactName || '',
      contactEmail: site.contactEmail || '', referredAt: stamp(), channel: 'Agent',
      agreementRef: '', feeBasis: '', feeUsd: null, locked: false
    },
    originationHistory: [], participants: [],
    stage: 'referred',
    stageHistory: [{ at: stamp(), from: '', to: 'referred', by: by, note: 'Uploaded by ' + by }],
    projectType: site.projectType || '',
    siteNotes: site.notes || '',
    categories: [], sizeMw: site.sizeMw, sizeMwh: site.sizeMwh, capexUsd: null,
    preDev: { budgetUsd: null, spentUsd: 0, startedAt: null, owner: '' },
    verification: { verdictId: '', verifierOrg: '', feasibility: '', bankability: '', signedAt: null },
    funding: { requestedUsd: null, committedUsd: null, closedUsd: null, counterparty: '', investorOrg: '', structure: '',
               listedAt: null, committedAt: null, closedAt: null, draws: [] },
    build: { ntpAt: null, codAt: null, epcOrg: '', note: '' },
    bom: [], notes: [],
    activity: [entry('created', 'Site uploaded by ' + by + ' (agent key).', by)],
    externalIds: site.externalId ? { agent: site.externalId } : {},
    orgsInvolved: [partnerOrg],
    createdAt: stamp(), updatedAt: stamp()
  };
  if (site.acres != null) doc.acres = site.acres;
  if (site.lat != null && !outline) {
    /* A pin with no ring: keep it where the portfolio keeps a location, so
       the map and the KMZ have a point to stand on. Not a score. */
    doc.grid = { score: null, ranAt: null, ranBy: '', source: '', lat: site.lat, lng: site.lng,
                 resolvedAddress: '', geocode: null, substations: [], lines: [], plants: [], findings: [], summary: '', raw: null };
  }
  if (outline) doc.outline = outline;
  if (grid) doc.grid = grid;
  return doc;
}

/* The update for an existing deal: additive only. Returns null when there is
   nothing to write. `existing` is the raw deal document. */
function updateDoc(site, existing, caller, outline, grid) {
  var by = caller.label || 'agent', fields = {}, changed = [];
  var has = function (v) { return v != null && v !== ''; };
  if (outline) { fields.outline = outline; changed.push('outline'); }
  if (grid && !(existing.grid && existing.grid.ranAt && existing.grid.source !== 'site-intel')) {
    /* A Grid Atlas run, or a score somebody chose, is not overwritten by a
       re-traced file; a previous site-intel score is. */
    fields.grid = grid; changed.push('grid score');
  }
  if (has(site.sizeMw) && !has(existing.sizeMw)) { fields.sizeMw = site.sizeMw; changed.push('size'); }
  if (has(site.sizeMwh) && !has(existing.sizeMwh)) { fields.sizeMwh = site.sizeMwh; changed.push('sizeMwh'); }
  if (has(site.address) && !has(existing.address)) { fields.address = site.address; changed.push('address'); }
  if (has(site.state) && !has(existing.state)) { fields.state = site.state; changed.push('state'); }
  if (has(site.acres) && !has(existing.acres) && !outline) { fields.acres = site.acres; changed.push('acres'); }
  if (has(site.projectType) && !has(existing.projectType)) { fields.projectType = site.projectType; changed.push('project type'); }
  if (has(site.notes) && site.notes !== existing.siteNotes) {
    fields.siteNotes = existing.siteNotes ? existing.siteNotes + '\n\n' + site.notes : site.notes; changed.push('notes');
  }
  if (site.externalId && !(existing.externalIds || {}).agent) {
    fields.externalIds = Object.assign({}, existing.externalIds || {}, { agent: site.externalId }); changed.push('externalId');
  }
  if (site.lat != null && !existing.outline && !(existing.grid && num(existing.grid.lat) != null)) {
    fields.grid = Object.assign({ score: null, ranAt: null, ranBy: '', source: '', resolvedAddress: '', geocode: null,
      substations: [], lines: [], plants: [], findings: [], summary: '', raw: null }, existing.grid || {}, { lat: site.lat, lng: site.lng });
    changed.push('location');
  }
  if (!changed.length) return null;
  fields.updatedAt = stamp();
  fields._activityEntry = entry('agent', 'Updated by ' + by + ': ' + changed.join(', ') + '.', by);
  fields._changed = changed;
  return fields;
}

/* Which existing deal is this upload? externalId first, then name|address. */
function matchExisting(site, existing) {
  var key = normKey(site.name, site.address);
  var byExt = null, byKey = null;
  existing.forEach(function (e) {
    var d = e.data;
    if (site.externalId && (d.externalIds || {}).agent === site.externalId && !byExt) byExt = e;
    if (key && !byKey && normKey(d.name, d.address) === key) byKey = e;
  });
  return byExt || byKey || null;
}

module.exports = {
  num: num, normKey: normKey, toRing: toRing, centroidOf: centroidOf, stateFromAddress: stateFromAddress,
  outlineFromKML: outlineFromKML, outlineFromInput: outlineFromInput, gridRecord: gridRecord,
  summary: summary, detail: detail, kmlSite: kmlSite, filterAndSort: filterAndSort,
  validateSite: validateSite, newDealDoc: newDealDoc, updateDoc: updateDoc, matchExisting: matchExisting,
  MAX_RING_POINTS: MAX_RING_POINTS, DEAD_STAGES: DEAD_STAGES, SI: SI
};
