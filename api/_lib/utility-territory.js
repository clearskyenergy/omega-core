/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   WHOSE WIRE IS THIS? The serving-utility candidates at a point (DESIGN C6).

   No national layer answers that alone. The HIFLD retail territories (the
   Esri copy joined to EIA-861 2024, then two fallbacks) overlap badly:
   Phoenix returns twelve polygons, Rockford a Wisconsin co-op beside ComEd,
   Norwalk four utilities, Panama City Duke Energy Florida alone (it is FPL,
   former Gulf Power). So this returns CANDIDATES, ranked:

     1. a state's own layer where one exists and was verified on 2026-10-17
        (NJDEP, the California Energy Commission, SELC's Georgia map, the
        Massachusetts town-by-town provider list, Lee County, the 2019
        Florida IOU layer for Northwest Florida);
     2. the national layer, with the polygons that are not a point's retail
        utility marked weak: federal marketers, water and irrigation
        districts, county-sized stand-ins (most small Arizona polygons), and
        a city utility whose city the point is not in (Census places);
     3. smaller polygons before larger.

   The WIRE is then decided by evidence, in the door: the candidate whose
   published hosting layer returns a feature at the point (ComEd at
   Rockford, Ameren at Decatur, Eversource in Norwalk). This module never
   claims more than the territory layers say: `confident` is true only when
   one non-weak candidate is left.

   Pure apart from the injected fetchJson(url, {timeoutMs}) → Promise<json>.
   Never echoes an upstream body. */
'use strict';
var HS = require('./hosting-sources');

var TIMEOUT_MS = 8000;

function natMap(a) {
  return { eiaId: a.Utility_ID != null ? a.Utility_ID : a.ID, name: a.NAME, type: a.TYPE, holding: a.HOLDING_CO, state: a.STATE,
    customers: a.Total_Customer_Count_2024 != null ? a.Total_Customer_Count_2024 : a.CUSTOMERS, area: a.Shape__Area };
}
var NATIONAL = [
  { key: 'esri-territories', label: 'HIFLD retail service territories (Esri, EIA-861 2024)',
    url: 'https://services8.arcgis.com/peDZJliSvYims39Q/arcgis/rest/services/Electricity_Rates_H3_Res5/FeatureServer/7',
    outFields: ['NAME', 'Utility_ID', 'STATE', 'TYPE', 'HOLDING_CO', 'Total_Customer_Count_2024', 'Shape__Area'], map: natMap },
  { key: 'ntia-territories', label: 'HIFLD retail service territories (NTIA copy, 2022)',
    url: 'https://services3.arcgis.com/OYP7N6mAJJCyH6hd/arcgis/rest/services/Electric_Retail_Service_Territories_HIFLD/FeatureServer/0',
    outFields: ['*'], map: natMap },
  { key: 'hifld-2021-territories', label: 'HIFLD retail service territories (2021 copy)',
    url: 'https://services5.arcgis.com/HDRa0B57OVrv2E1q/arcgis/rest/services/Electric_Retail_Service_Territories/FeatureServer/0',
    outFields: ['*'], map: natMap }
];

/* ── the state layers and how each names a utility ──────────────────── */
var NJ_LABEL = { 'PSE&G': '15477', 'JCP&L': '9726', ACE: '963', 'Rockland Electric': '16213', Cooperative: '40299' };
var NJ_MUNI = { butler: '2650', madison: '11476', 'south river': '17571', 'park ridge': '14472', 'seaside heights': '16864', milltown: '12608', lavallette: '10776', pemberton: '14648', vineland: '19856' };
function mapNj(a) {
  var label = String(a.LABEL || '').trim(), name = String(a.NAME || '').trim();
  if (NJ_LABEL[label]) return { eiaId: NJ_LABEL[label], name: name || label, type: label === 'Cooperative' ? 'COOPERATIVE' : 'INVESTOR OWNED' };
  if (label === 'Municipal') {
    var town = name.replace(/^Municipal-\s*/i, '').toLowerCase();
    if (!town && +a.OBJECTID === 17) town = 'vineland';          /* the Vineland polygon's NAME is blank */
    return { eiaId: NJ_MUNI[town] || null, name: town ? 'Municipal electric: ' + town.replace(/\b\w/g, function (c) { return c.toUpperCase(); }) : 'Municipal electric', type: 'MUNICIPAL' };
  }
  return null;
}
var CEC_ID = { LADWP: '11208', SMUD: '16534', IID: '9216' };
var CEC_TYPE = { IOU: 'INVESTOR OWNED', POU: 'MUNICIPAL', 'CO-OP': 'COOPERATIVE', TRIBAL: 'TRIBAL' };
function mapCec(a) {
  var t = String(a.Type || '').trim().toUpperCase(), name = String(a.Utility || '').trim();
  if (t === 'CCA' || t === 'ADMIN') return null;                          /* a community choice aggregator or WAPA: not a wires utility */
  if (/metropolitan water|resource pooling|eastside power/i.test(name)) return null;   /* wholesale overlays */
  var acr = String(a.Acronym || '').trim();
  return { eiaId: a.HIFLD_ID || CEC_ID[acr] || (/imperial irrigation/i.test(name) ? '9216' : null), name: name, type: CEC_TYPE[t] || t };
}
var GA_ID = { 'georgia power': '7140', 'jackson emc': '9601', 'cobb emc': '3916', 'sawnee emc': '16865', 'greystone power corp.': '7090', 'walton emc': '20065',
  'snapping shoals emc': '17832', 'north georgia emc': '13716', 'flint energies': '6411', 'coweta-fayette emc': '4432', 'marietta - meag power': '11646',
  'dalton utilities': '4744', 'elec. power bd of chat.': '3408' };
var GA_TYPE = { IOU: 'INVESTOR OWNED', EMC: 'COOPERATIVE', MUNI: 'MUNICIPAL' };
function mapGa(a) {
  var cls = String(a.CLASSIFICA || '');
  if (/historical boundary|wildlife management/i.test(cls)) return null;  /* overlays that carry a name but are not service areas */
  var name = String(a.Utility_Name || '').trim(), t = String(a.Utility_Type || '').toUpperCase();
  if (!name || /unassigned/i.test(t) || /unassigned/i.test(cls)) return { eiaId: null, name: 'Unassigned under the Territorial Act', type: 'UNASSIGNED', unassigned: true };
  return { eiaId: GA_ID[name.toLowerCase()] || null, name: name, type: GA_TYPE[t] || 'MUNICIPAL' };
}
function mapMa(a) {
  return String(a.ELEC || '').split(/,\s*(?=[A-Z])/).map(function (s) {
    s = s.trim();
    if (!s) return null;
    if (/eversource/i.test(s)) return { eiaId: '54913', name: s, type: 'INVESTOR OWNED' };
    if (/nantucket/i.test(s)) return { eiaId: '13206', name: s, type: 'INVESTOR OWNED' };
    if (/national grid/i.test(s)) return { eiaId: '11804', name: s, type: 'INVESTOR OWNED' };
    if (/unitil|fitchburg/i.test(s)) return { eiaId: '6374', name: s, type: 'INVESTOR OWNED' };
    return { eiaId: /^concord municipal/i.test(s) ? '4147' : null, name: s, type: 'MUNICIPAL' };
  }).filter(Boolean);
}
function mapFl2019(a) {
  if (String(a.ID) === '7801') return { eiaId: '6452', name: 'Florida Power & Light (former Gulf Power)', type: 'INVESTOR OWNED', prefer: true };
  return { eiaId: a.ID, name: a.NAME, type: 'INVESTOR OWNED' };
}
function mapLee(a) {
  var t = String(a.type || '').toUpperCase();
  if (t === 'LCEC') return { eiaId: '10857', name: 'Lee County Electric Cooperative', type: 'COOPERATIVE' };
  if (t === 'FPL') return { eiaId: '6452', name: 'Florida Power & Light', type: 'INVESTOR OWNED' };
  return null;
}
/* `authority`: the layer is the state's (or county's) own answer, so a
   national polygon it does not name is weak at this point. */
var STATE_LAYERS = [
  { key: 'njdep-territories', states: ['NJ'], authority: true, label: 'NJDEP electric utility territories',
    url: 'https://mapsdep.nj.gov/arcgis/rest/services/Features/Utilities/MapServer/10', outFields: ['OBJECTID', 'NAME', 'LABEL', 'TYPE'], map: mapNj },
  { key: 'cec-territories', states: ['CA'], authority: true, label: 'California Energy Commission load-serving entities',
    url: 'https://services3.arcgis.com/bWPjFyq029ChCGur/arcgis/rest/services/ElectricLoadServingEntities_IOU_POU/FeatureServer/0', outFields: ['Utility', 'Acronym', 'Type', 'HIFLD_ID'], map: mapCec },
  { key: 'cec-other-territories', states: ['CA'], authority: true, label: 'California Energy Commission co-ops and tribal utilities',
    url: 'https://services3.arcgis.com/bWPjFyq029ChCGur/arcgis/rest/services/ElectricLoadServingEntities_Other/FeatureServer/0', outFields: ['Utility', 'Acronym', 'Type', 'HIFLD_ID'], map: mapCec },
  { key: 'selc-ga-territories', states: ['GA'], authority: true, label: 'SELC Georgia territories (third-party, generalised; the PSC county maps are authoritative)',
    url: 'https://services2.arcgis.com/JlKIqTDRreahnYR7/arcgis/rest/services/GA_EMCTerritories_SELC_Clip/FeatureServer/3', outFields: ['Utility_Name', 'Utility_Type', 'CLASSIFICA'], map: mapGa },
  { key: 'ma-town-providers', states: ['MA'], authority: true, label: 'Massachusetts electricity providers by town (EOEEA)',
    url: 'https://services1.arcgis.com/7iJyYTjCtKsZS1LR/arcgis/rest/services/Massachusetts_Grid_Modernization_2018_to_2022/FeatureServer/37', outFields: ['TOWN', 'ELEC'], map: mapMa },
  { key: 'fl-iou-2019', box: [29.9, -87.7, 31.05, -84.85], states: ['FL'], authority: false, label: 'Florida investor-owned territories, 2019 (Gulf Power, now FPL)',
    url: 'https://services.arcgis.com/XG15cJAlne2vxtgt/arcgis/rest/services/Retail_Service_Territories_FL_InvestorOwned/FeatureServer/5', outFields: ['ID', 'NAME'], map: mapFl2019 },
  { key: 'lee-county-territories', box: [26.30, -82.30, 26.80, -81.55], states: ['FL'], authority: true, label: 'Lee County electric territories',
    url: 'https://services2.arcgis.com/LvWGAAhHwbCJ2GMP/arcgis/rest/services/Electric_Territories/FeatureServer/0', outFields: ['type'], map: mapLee }
];
/* A layer with a `box` is asked inside the box; `states` is then only the
   state its rows belong to (a state layer's rows carry no STATE of their own,
   and the registry's groups answer only for a utility of their state). */
var PLACES = { key: 'census-places', label: 'Census incorporated places',
  url: 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Places_CouSub_ConCity_SubMCD/MapServer/4', outFields: ['NAME', 'BASENAME'] };

/* County-sized or urban-area-sized stand-in polygons (Arizona, proven by
   identical areas): a hit on one means nothing. They stay in the list,
   last, for a person to confirm. */
var COARSE = ['30518', '15048', '15049', '5729', '8700', '25866', '12351', '14543', '65261', '19604', '176'];

/* Boundaries that enclose other utilities' islands the public layers cannot
   separate. SRP's own boundary (its 1955 agreement with APS and 1954
   agreement with the City of Mesa) has APS and City of Mesa islands in it —
   Mill Ave in Tempe, downtown Phoenix, old-town Gilbert, downtown Mesa
   (verify r21, 2026-10-17) — and the layer that draws them may not be
   redistributed without SRP's permission, so a point in SRP's polygon is
   never answered as SRP with confidence. */
var ISLANDS = {
  '16572': 'Salt River Project\'s boundary encloses Arizona Public Service and City of Mesa islands that the public territory maps cannot separate; confirm the utility with the customer\'s bill.'
};

function pointUrl(layer, lat, lng) {
  return layer.url + '/query?f=json&geometry=' + encodeURIComponent((+lng).toFixed(6) + ',' + (+lat).toFixed(6)) +
    '&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=' + encodeURIComponent(layer.outFields.join(',')) + '&returnGeometry=false';
}
function inBox(b, lat, lng) { return b && lat >= b[0] && lat <= b[2] && lng >= b[1] && lng <= b[3]; }
function outcomeOf(err) {
  if (!err) return 'error';
  if (err.name === 'AbortError' || err.timeout) return 'timeout';
  if (err.blocked) return 'blocked';
  return err.status ? 'error HTTP ' + err.status : (err.service ? 'service error' : 'error');
}
function ask(layer, lat, lng, deps, tried) {
  var now = deps.now || Date.now, t0 = now();
  var left = deps.deadline ? deps.deadline - t0 : TIMEOUT_MS;
  if (left < 250) { tried.push({ source: layer.key, ms: 0, outcome: 'skipped (out of time)' }); return Promise.resolve(null); }
  /* a timeoutMs of 0 is no time at all, never the 8-second default */
  var per = deps.timeoutMs != null && isFinite(deps.timeoutMs) ? +deps.timeoutMs : TIMEOUT_MS;
  return Promise.resolve().then(function () { return deps.fetchJson(pointUrl(layer, lat, lng), { timeoutMs: Math.min(per, left) }); })
    .then(function (j) {
      if (!j || typeof j !== 'object' || j.error) { var e = new Error('service error'); e.service = true; throw e; }
      var f = Array.isArray(j.features) ? j.features : [];
      tried.push({ source: layer.key, ms: now() - t0, outcome: f.length ? 'features ' + f.length : 'empty' });
      return f.map(function (x) { return x && x.attributes ? x.attributes : {}; });
    }, function (err) { tried.push({ source: layer.key, ms: now() - t0, outcome: outcomeOf(err) }); return null; });
}
function normType(t) {
  t = String(t || '').trim().toUpperCase();
  return t === 'IOU' ? 'INVESTOR OWNED' : t;
}
function titleCase(s) {
  return String(s || '').toLowerCase().replace(/\b([a-z])/g, function (c) { return c.toUpperCase(); })
    .replace(/\b(Co|Llc|Inc|Emc|Ii|Iii)\b\.?/g, function (w) { return w.toUpperCase(); }).replace(/ - \((\w\w)\)$/i, '')
    .replace(/ (Of|And|The|For) /g, function (w) { return w.toLowerCase(); }).trim();
}
function candidateOf(c, states) {
  var e = HS.forCandidate(c, states);
  var specific = e && e.type !== 'group';
  return { eiaId: c.eiaId != null && c.eiaId !== '' ? String(c.eiaId) : null, name: String(c.name || '').slice(0, 120),
    display: specific ? e.display : titleCase(c.name), type: normType(c.type), holding: c.holding ? String(c.holding).slice(0, 80) : null,
    state: c.state ? String(c.state).slice(0, 2) : null, registryKey: e ? e.key : null,
    weak: false, fromState: false, prefer: !!c.prefer, area: typeof c.area === 'number' ? c.area : null,
    customers: typeof c.customers === 'number' && c.customers > 0 ? c.customers : null, layers: [] };
}
function cityMatches(name, places) {
  var n = String(name || '').toUpperCase();
  return places.some(function (p) { var b = String(p.BASENAME || '').toUpperCase().trim(); return b && n.indexOf(b) >= 0; });
}

/* at(lat, lng, deps) → { candidates, confident, caution, source, approximate, partial, failed, states, tried }
   deps: { fetchJson, timeoutMs?, deadline? (epoch ms; nothing is asked after it), now? }
   `partial`: a state layer, the Census places layer or the whole national
   chain did not answer (failed, or skipped for time; `failed` names them).
   The answer stands on what did answer, and the door never keeps it as if
   it were whole: a state's own authority missed once must not be missed for
   a week. */
function at(lat, lng, deps) {
  deps = deps || {};
  var tried = [], states = HS.statesAt(lat, lng);
  var stateLayers = STATE_LAYERS.filter(function (l) { return l.box ? inBox(l.box, lat, lng) : l.states.some(function (s) { return states.indexOf(s) >= 0; }); });
  function national(i) {
    if (i >= NATIONAL.length) return Promise.resolve(null);
    return ask(NATIONAL[i], lat, lng, deps, tried).then(function (rows) { return rows ? { layer: NATIONAL[i], rows: rows } : national(i + 1); });
  }
  var pState = Promise.all(stateLayers.map(function (l) { return ask(l, lat, lng, deps, tried).then(function (rows) { return { layer: l, rows: rows }; }); }));
  var pPlaces = states.length ? ask(PLACES, lat, lng, deps, tried) : Promise.resolve(null);
  return Promise.all([national(0), pState, pPlaces]).then(function (r) {
    var nat = r[0], st = r[1], places = r[2];
    var byId = {}, list = [], sources = [];
    function add(raw, layer, fromState) {
      if (!raw) return;
      if (fromState && !raw.state && layer.states && layer.states.length === 1) raw.state = layer.states[0];
      var c = candidateOf(raw, states);
      if (c.eiaId && HS.NEVER.indexOf(c.eiaId) >= 0) return;
      var k = c.eiaId ? 'eia:' + c.eiaId : 'name:' + c.name.toLowerCase();
      var have = byId[k];
      if (!have) { have = byId[k] = c; list.push(c); }
      else {
        if (fromState && !have.fromState) { have.name = c.name || have.name; }
        if (c.area != null && (have.area == null || c.area < have.area)) have.area = c.area;
        if (c.customers && !have.customers) have.customers = c.customers;
        if (c.holding && !have.holding) have.holding = c.holding;
        if (c.prefer) have.prefer = true;
      }
      if (fromState) have.fromState = true;
      if (raw.unassigned) have.unassigned = true;
      if (have.layers.indexOf(layer.key) < 0) have.layers.push(layer.key);
    }
    var authority = false;
    st.forEach(function (x) {
      if (!x.rows) return;
      if (x.rows.length) sources.push(x.layer.label);
      x.rows.forEach(function (a) { var m = x.layer.map(a); (Array.isArray(m) ? m : [m]).forEach(function (c) { add(c, x.layer, true); }); });
      if (x.layer.authority && x.rows.length && list.some(function (c) { return c.fromState; })) authority = true;
    });
    if (nat) {
      sources.push(nat.layer.label);
      nat.rows.forEach(function (a) { add(nat.layer.map(a), nat.layer, false); });
    }
    /* what is weak at this point */
    list.forEach(function (c) {
      var known = c.eiaId ? HS.byEia(c.eiaId) : null;
      if (c.fromState) return;
      if (authority) { c.weak = true; c.why = 'not on the state\'s own territory layer here'; return; }
      if (c.eiaId && COARSE.indexOf(c.eiaId) >= 0) {
        /* A city's own utility whose polygon is the whole city: the point is
           inside the city, so the city may well serve it (downtown Mesa is
           City of Mesa Electric, not SRP; 2026-10-17, Tommy's 29 W Main St).
           Its real service area is smaller than the city, so it stays a
           candidate to confirm, never the answer by itself. */
        if (places && c.type === 'MUNICIPAL' && cityMatches(c.name, places)) { c.why = 'the city\'s own utility; it serves part of the city, so confirm with the bill'; c.ambiguous = true; return; }
        c.weak = true; c.why = 'a county-sized stand-in polygon'; return;
      }
      if (c.type === 'FEDERAL') { c.weak = true; c.why = 'a federal system'; return; }
      if (!known && (c.type === 'NOT AVAILABLE' || /irrigation|drainage|water|conserv/i.test(c.name))) { c.weak = true; c.why = 'a water or irrigation district'; return; }
      if (places && /^(CITY|VILLAGE|TOWN|BOROUGH) OF /i.test(c.name) && !cityMatches(c.name, places)) { c.weak = true; c.why = 'the point is not inside that city'; }
    });
    list.sort(function (a, b) {
      if (a.prefer !== b.prefer) return a.prefer ? -1 : 1;
      if (a.weak !== b.weak) return a.weak ? 1 : -1;
      if (a.fromState !== b.fromState) return a.fromState ? -1 : 1;
      var aa = a.area == null ? Infinity : a.area, ba = b.area == null ? Infinity : b.area;
      if (aa !== ba) return aa - ba;
      return (b.customers || 0) - (a.customers || 0);
    });
    var answered = !!nat || st.some(function (x) { return !!x.rows; });
    var approximate = false;
    if (!answered) {
      /* every territory layer failed: the registry's own rough boxes, said so */
      approximate = true;
      HS.ENTRIES.forEach(function (e) {
        if (e.bbox && inBox(e.bbox, lat, lng) && e.status === 'verified') {
          var c = candidateOf({ eiaId: e.eiaIds[0], name: e.legal || e.display, type: 'INVESTOR OWNED' }, states);
          c.weak = false; c.layers = ['registry-bbox']; list.push(c);
        }
      });
      sources.push('the registry\'s own rough boxes (every territory layer failed)');
    }
    var strong = list.filter(function (c) { return !c.weak; });
    /* A boundary that encloses other utilities' islands the public maps
       cannot separate (ISLANDS): never a confident answer on its own. */
    var caution = null;
    strong.forEach(function (c) { if (!caution && c.eiaId && ISLANDS[c.eiaId]) caution = ISLANDS[c.eiaId]; });
    var failed = st.filter(function (x) { return !x.rows; }).map(function (x) { return x.layer.key; });
    if (states.length && !places) failed.push(PLACES.key);
    if (!nat) NATIONAL.forEach(function (l) { failed.push(l.key); });
    return {
      candidates: list.slice(0, 12).map(function (c) {
        return { eiaId: c.eiaId, name: c.name, display: c.display, type: c.type, holding: c.holding, state: c.state, registryKey: c.registryKey,
          weak: c.weak, why: c.why || null, fromState: c.fromState, unassigned: !!c.unassigned };
      }),
      caution: caution,
      confident: strong.length === 1 && !approximate && !caution,
      source: sources.join(' + ') || null,
      approximate: approximate,
      partial: failed.length > 0,
      failed: failed,
      states: states,
      tried: tried
    };
  });
}

module.exports = { at: at, NATIONAL: NATIONAL, STATE_LAYERS: STATE_LAYERS, PLACES: PLACES, COARSE: COARSE, ISLANDS: ISLANDS, TIMEOUT_MS: TIMEOUT_MS,
  _t: { mapNj: mapNj, mapCec: mapCec, mapGa: mapGa, mapMa: mapMa, mapFl2019: mapFl2019, mapLee: mapLee, pointUrl: pointUrl, titleCase: titleCase } };
