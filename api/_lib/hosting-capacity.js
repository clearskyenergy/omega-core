/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   Hosting-capacity adapters for utilities that publish an open ArcGIS
   service. Pure: this file builds the query and normalizes a feature.
   The caller supplies fetch (scripts/validate-analysis-data.js --live,
   or a later authenticated route). No API key.

   Two publisher shapes, verified against the live services on 2026-10-17:
     pge-grip       PG&E GRIP LineDetail, kilowatts, line section
     ng-pv-feeder   National Grid MA and NY PV hosting, megawatts, feeder

   A line-section figure is not additive along the feeder. The note on
   each PG&E row says so. ComEd is not in this registry: its service
   requires the viewer's Referer and the name rotates monthly, and
   api/_lib/comed-service.js already owns that door. */
'use strict';

var SOURCES = [
  {
    id: 'pge-grip',
    shape: 'pge-line',
    utility: 'Pacific Gas and Electric',
    states: ['CA'],
    grain: 'line section',
    access: 'arcgis-feature',
    auth: 'none',
    cadence: 'PG&E publishes Integration Capacity Analysis on the Grid Resource Integration Portal. The map value is the minimum of the hourly criteria.',
    service: 'https://services2.arcgis.com/mJaJSax0KPHoCNB6/arcgis/rest/services/DRPComplianceRelProd/FeatureServer',
    layer: 3,
    radiusM: 250,
    units: 'kW',
    verified: '2026-10-17',
    viewer: 'https://www.pge.com/en/about/doing-business-with-pge/interconnections/distributed-resource-planning-data-and-maps.html',
    fields: 'FeederId,FeederName,LoadCapacity_kW,GenCapacity_kW,GenericPVCapacity_kW,voltage_kv,ICA_Analysis_Date,Last_Update_On_Map'
  },
  {
    id: 'ng-ma-feeder',
    shape: 'ng-pv-feeder',
    utility: 'National Grid Massachusetts',
    states: ['MA'],
    grain: 'feeder',
    access: 'arcgis-map',
    auth: 'none',
    cadence: 'National Grid stamps hca_refresh_date on the feeder layer. PV hosting capacity is in megawatts.',
    service: 'https://systemdataportal.nationalgrid.com/arcgis/rest/services/MASDP/Nodal_Hosting_Capacity_MA/MapServer',
    layer: 0,
    radiusM: 1000,
    units: 'MW',
    verified: '2026-10-17',
    viewer: 'https://www.nationalgridus.com/MA-Business/Connected-Solutions/System-Data-Portal',
    fields: 'feeder_cdf,Master_CDF,substation_name,feeder_max_hc,feeder_min_hc,feeder_queued_dg,feeder_installed_dg,feeder_voltage,hca_refresh_date'
  },
  {
    id: 'ng-ny-feeder',
    shape: 'ng-pv-feeder',
    utility: 'National Grid New York',
    states: ['NY'],
    grain: 'feeder',
    access: 'arcgis-map',
    auth: 'none',
    cadence: 'Same National Grid system-data portal as Massachusetts. PV hosting capacity is in megawatts. The feeder id is Master_CDF. This layer has no feeder_cdf or substation_name; asking for either makes the query fail.',
    service: 'https://systemdataportal.nationalgrid.com/arcgis/rest/services/NYSDP/Hosting_Capacity_Data/MapServer',
    layer: 0,
    radiusM: 1000,
    units: 'MW',
    verified: '2026-10-17',
    viewer: 'https://www.nationalgridus.com/Upstate-NY-Business/Distributed-Generation/System-Data-Portal',
    fields: 'Master_CDF,substation_bank_name,feeder_max_hc,feeder_min_hc,feeder_queued_dg,feeder_installed_dg,feeder_voltage,hca_refresh_date'
  }
];

function byId(id) {
  var i;
  for (i = 0; i < SOURCES.length; i++) if (SOURCES[i].id === id) return SOURCES[i];
  return null;
}

/* The first registry row whose states include this code. ComEd is not in
   the registry (comed-service.js owns that door), so Illinois returns null
   and the caller keeps the parcel probe. */
function sourceForState(state) {
  var st = String(state || '').trim().toUpperCase();
  var i;
  if (!/^[A-Z]{2}$/.test(st)) return null;
  for (i = 0; i < SOURCES.length; i++) {
    if (SOURCES[i].states.indexOf(st) >= 0) return SOURCES[i];
  }
  return null;
}

function sourceOf(source) {
  var s = typeof source === 'string' ? byId(source) : source;
  if (!s || !s.service) throw new Error('unknown hosting source');
  return s;
}

function queryUrl(source, lat, lon, radiusM) {
  var s = sourceOf(source);
  var latN = +lat, lonN = +lon, radius = radiusM != null ? +radiusM : s.radiusM;
  if (!isFinite(latN) || !isFinite(lonN) || latN < -90 || latN > 90 || lonN < -180 || lonN > 180) {
    throw new Error('lat and lon are required');
  }
  if (!isFinite(radius) || radius <= 0 || radius > 5000) throw new Error('radius must be within 5 km');
  var base = String(s.service).replace(/\/$/, '') + '/' + s.layer + '/query';
  return base + '?' + [
    'f=json',
    'geometry=' + encodeURIComponent(lonN + ',' + latN),
    'geometryType=esriGeometryPoint',
    'inSR=4326',
    'spatialRel=esriSpatialRelIntersects',
    'distance=' + encodeURIComponent(String(radius)),
    'units=esriSRUnit_Meter',
    'outFields=' + encodeURIComponent(s.fields),
    'returnGeometry=false',
    'resultRecordCount=8'
  ].join('&');
}

function metadataUrl(source) {
  var s = sourceOf(source);
  return String(s.service).replace(/\/$/, '') + '/' + s.layer + '?f=json';
}

function num(v) {
  if (v == null || v === '') return null;
  var n = +v;
  return isFinite(n) ? n : null;
}

/* Megawatts on a National Grid layer become kilowatts. A blank stays
   blank: a missing generation figure is not zero. */
function kwFrom(v, units) {
  var n = num(v);
  if (n == null) return null;
  if (units === 'MW') return Math.round(n * 1000000) / 1000;
  return n;
}

function dateFromEpochMs(v) {
  var n = num(v);
  if (n == null || n < 1e11) return null;
  var d = new Date(n);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/* Massachusetts stamps hca_refresh_date as text ("10/02/2026").
   New York stamps the same field as epoch milliseconds. A blank stays blank. */
function asOf(v) {
  if (v == null || v === '') return null;
  var n = typeof v === 'number' ? v : (typeof v === 'string' && /^[0-9]+$/.test(v) ? +v : NaN);
  if (isFinite(n) && n >= 1e11) return dateFromEpochMs(n);
  return String(v);
}

function normalize(source, feature) {
  var s = sourceOf(source);
  var a = (feature && feature.attributes) || {};
  if (s.shape === 'pge-line') {
    return {
      sourceId: s.id, utility: s.utility, grain: s.grain,
      feederId: a.FeederId == null ? null : String(a.FeederId),
      name: a.FeederName || null, substation: null,
      loadKw: num(a.LoadCapacity_kW), genKw: num(a.GenCapacity_kW), pvKw: num(a.GenericPVCapacity_kW),
      pvMinKw: null, queuedKw: null, installedKw: null,
      voltageKv: num(a.voltage_kv),
      asOf: asOf(a.ICA_Analysis_Date) || dateFromEpochMs(a.Last_Update_On_Map),
      note: 'Line-section ICA. Sections on one feeder share the feeder limit, so these kilowatts are not added together.'
    };
  }
  return {
    sourceId: s.id, utility: s.utility, grain: s.grain,
    feederId: a.feeder_cdf || a.Master_CDF || null,
    name: a.feeder_cdf || a.Master_CDF || null,
    substation: a.substation_name || a.substation_bank_name || null,
    loadKw: null, genKw: null,
    pvKw: kwFrom(a.feeder_max_hc, 'MW'),
    pvMinKw: kwFrom(a.feeder_min_hc, 'MW'),
    queuedKw: kwFrom(a.feeder_queued_dg, 'MW'),
    installedKw: kwFrom(a.feeder_installed_dg, 'MW'),
    voltageKv: num(a.feeder_voltage),
    asOf: asOf(a.hca_refresh_date),
    note: 'Feeder PV hosting capacity. The service publishes megawatts; this record is kilowatts.'
  };
}

module.exports = {
  SOURCES: SOURCES, byId: byId, sourceForState: sourceForState,
  queryUrl: queryUrl, metadataUrl: metadataUrl,
  normalize: normalize, kwFrom: kwFrom
};
