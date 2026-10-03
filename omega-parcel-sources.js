/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * omega-parcel-sources.js — the ONE list of public parcel layers.
 *
 * Google's Maps JavaScript API publishes no parcel layer: the property lines
 * in the consumer Maps app are not offered to developers. Lines come from the
 * people who keep them, county and state assessors, and most publish an
 * ArcGIS MapServer. This file names the ones verified to answer, and is read
 * by both of their users:
 *
 *   editor.html      View › Parcel Lines draws each layer's lines on the live
 *                    Google map as an ImageMapType (the browser asks the
 *                    county for a picture of a tile; no key, nothing
 *                    confidential, Google owns tiling and panning).
 *   api/parcel.js    the server's point lookup asks a `lookup` layer for the
 *                    one parcel under a point (geometry and owner), after
 *                    Regrid when the tenant's plan carries it.
 *
 * Cook County moved its layer in 2026. Two copies of a URL drift and the
 * stale one is the one somebody is looking at, so a county that moves is
 * fixed HERE. workers/comed-proxy-worker-v10.js keeps its own attribute copy
 * for the browser proxy (Cloudflare cannot require this file); keep it in
 * step when a layer moves.
 *
 * Before adding a layer: ask `<service>?f=json` for the layer id and its
 * minScale, then `<service>/export?...` for one tile where parcels are known
 * to be, and record that place as the source's `test` point. A layer drawn
 * below its minScale comes back as an empty picture, which is why each one
 * carries the zoom it starts drawing at. scripts/tests/tparcellines.js
 * checks the shape (offline); `node scripts/check-parcel-sources.js` asks
 * every county for the tile at its `test` point and says which still draw
 * (network, so not in npm test) — run it when a county may have moved.
 *
 * bbox is [south, west, north, east] in degrees, rounded OUTWARD. It is a
 * cheap pre-test, "could this tile or point be in that county", not the
 * county line: boxes overlap (Cook's holds all of DuPage's), and a tile in
 * two boxes is asked of both; the one it is not in answers transparent.
 *
 * Reference only: an assessor's line is a tax map, not a survey. Every
 * screen that draws one says so.
 *
 * ES5, no dependencies; UMD so api/ and the tests can require it. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.OmegaParcelSources = factory();
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  /* Verified 2026-10-02: each service answered ?f=json and drew lines on an
     export tile at a known parcel. `lineLayer` is the layer drawn on the map;
     `restyle` means the service accepts dynamicLayers, so it is drawn in the
     one line style below with its labels off (Cook's own style is dark blue
     with a PIN on every lot, unreadable on satellite). Lake County does not
     accept dynamicLayers and its own line layer (11, "Tax Parcel Lines") is a
     bright cyan that reads on imagery as it is.
     `lookup` is what api/parcel.js asks for the parcel under a point: the
     polygon layer, its id and owner fields (owner null: the public layer
     carries none), and the county name the answer reports. */
  var SOURCES = [
    { id: 'dupage', label: 'DuPage County, IL',
      service: 'https://gis.dupageco.org/arcgis/rest/services/DuPage_County_IL/ParcelsWithRealEstateCC/MapServer',
      lineLayer: 0, restyle: true, minZoom: 15,
      bbox: [41.63, -88.27, 42.02, -87.90], test: [41.8661, -88.1070],
      lookup: { layer: 0, idField: 'PIN', owner: 'BILLNAME', county: 'DuPage County' } },
    { id: 'lake', label: 'Lake County, IL',
      service: 'https://maps.lakecountyil.gov/arcgis/rest/services/GISMapping/WABParcels/MapServer',
      lineLayer: 11, restyle: false, minZoom: 15,
      bbox: [42.15, -88.20, 42.50, -87.75], test: [42.3636, -87.8448],
      lookup: { layer: 12, idField: 'pin', owner: 'taxpayer_name', county: 'Lake County' } },
    { id: 'cook', label: 'Cook County, IL',
      service: 'https://gis12.cookcountyil.gov/traditional/rest/services/CookViewer3Parcels/MapServer',
      lineLayer: 0, restyle: true, minZoom: 16,
      bbox: [41.46, -88.27, 42.16, -87.52], test: [41.8781, -87.6298],
      lookup: { layer: 0, idField: 'PIN14_dash', owner: null, county: 'Cook County' } },
    /* Ameren territory. Added 2026-10-03 for a customer's site at 107 Cass
       St, Peoria: "Parcels" in the county's Cadastral service (minScale
       10000, so from z16), PIN and owner_name on each lot. */
    { id: 'peoria', label: 'Peoria County, IL',
      service: 'https://gis.peoriacounty.gov/arcgis/rest/services/DP/Cadastral/MapServer',
      lineLayer: 1, restyle: true, minZoom: 16,
      bbox: [40.54, -90.00, 41.02, -89.44], test: [40.6753, -89.6108],
      lookup: { layer: 1, idField: 'PIN', owner: 'owner_name', county: 'Peoria County' } },
    /* "Parcels_LY": the county's published basemap parcels. */
    { id: 'will', label: 'Will County, IL',
      service: 'https://gis.willcountyillinois.com/hosting/rest/services/Basemap/Parcels_LY_DV/MapServer',
      lineLayer: 1, restyle: true, minZoom: 15,
      bbox: [41.19, -88.27, 41.73, -87.52], test: [41.5250, -88.0817] },
    /* ── Illinois, beyond Chicagoland and Peoria (verified 2026-10-03: the
       service listed the layer, its extent came back in WGS84, and a z17
       tile at `test` drew lines, restyled in yellow where `restyle`).
       Not public or not reachable that day: McHenry (403), Kendall,
       DeKalb and Whiteside (hosted FeatureServer only), Champaign,
       Livingston, Ford, Jackson, Christian (no public REST), Rock Island
       (annotation only), Ogle, Clinton, Jersey (viewer only), Woodford
       (private), Vermilion, Iroquois, Macoupin (broken certificates),
       Monroe (no single parcel layer), Kankakee (503 on 2026-10-03; it
       had answered an hour earlier). ── */
    { id: 'kane', label: 'Kane County, IL',
      service: 'https://gistech.countyofkane.org/arcgis/rest/services/KanePINList/MapServer',
      lineLayer: 0, restyle: true, minZoom: 15,
      bbox: [41.71, -88.61, 42.16, -88.23], test: [41.8869, -88.3086],
      lookup: { layer: 0, idField: 'PIN', owner: 'TaxName', county: 'Kane County' } },
    { id: 'sangamon', label: 'Sangamon County, IL',
      service: 'https://sangis.co.sangamon.il.us/server/rest/services/TyleratENTParcels/MapServer',
      lineLayer: 0, restyle: true, minZoom: 15,
      bbox: [39.51, -90.00, 39.98, -89.21], test: [39.8013, -89.6487],
      lookup: { layer: 0, idField: 'PIN', owner: null, county: 'Sangamon County' } },
    { id: 'mclean', label: 'McLean County, IL',
      service: 'https://gis.mcleancountyil.gov/arcgis/rest/services/BnZ/Parcels/MapServer',
      lineLayer: 0, restyle: true, minZoom: 15,
      bbox: [40.27, -89.28, 40.76, -88.45], test: [40.4793, -88.994],
      lookup: { layer: 0, idField: 'PIN', owner: null, county: 'McLean County' } },
    { id: 'stclair', label: 'St. Clair County, IL',
      service: 'https://arcgispublicmap.co.st-clair.il.us/server/rest/services/SCC_parcel_map_data/MapServer',
      lineLayer: 29, restyle: true, minZoom: 15,
      bbox: [38.21, -90.27, 38.67, -89.70], test: [38.5134, -89.984],
      lookup: { layer: 29, idField: 'parcel_number', owner: 'owner', county: 'St. Clair County' } },
    /* The City of Decatur's server; its layer covers all of Macon County. */
    { id: 'macon', label: 'Macon County, IL',
      service: 'https://maps.decaturil.gov/arcgis/rest/services/Public/parcels/MapServer',
      lineLayer: 0, restyle: true, minZoom: 16,
      bbox: [39.65, -89.23, 40.06, -88.74], test: [39.8406, -88.9516],
      lookup: { layer: 0, idField: 'DBO.Tax_Parcels.PARCELNUMBER', owner: 'DBO.Tax_Parcels.PRIMARYNAME', county: 'Macon County' } },
    /* No CORS header: lines draw, but a map capture leaves them out. */
    { id: 'tazewell', label: 'Tazewell County, IL',
      service: 'https://gis.tazewell-il.gov/arcgis/rest/services/WAB/TazCo_Parcels/MapServer',
      lineLayer: 0, restyle: true, minZoom: 15,
      bbox: [40.31, -89.93, 40.76, -89.25], test: [40.5676, -89.6407],
      lookup: { layer: 0, idField: 'PIN', owner: null, county: 'Tazewell County' } },
    /* No dynamicLayers here: its own style. */
    { id: 'grundy', label: 'Grundy County, IL',
      service: 'https://maps.grundyco.org/arcgis/rest/services/CountyWebsiteMaps/CountyParcelsBaseLayer_SPIE/MapServer',
      lineLayer: 0, restyle: false, minZoom: 16,
      bbox: [41.10, -88.60, 41.47, -88.24], test: [41.3573, -88.4212],
      lookup: { layer: 0, idField: 'Grundy_Master.SDEDATA.Parcel_Poly.PIN', owner: 'GrundyParcels.dbo.GISParcelsLegalDescriptionIncluded.taxname', county: 'Grundy County' } },
    /* No CORS header: lines draw, but a map capture leaves them out. */
    { id: 'lasalle', label: 'LaSalle County, IL',
      service: 'https://gis.lasallecounty.org/arcgis/rest/services/TaxParcels/MapServer',
      lineLayer: 0, restyle: true, minZoom: 15,
      bbox: [40.92, -89.17, 41.64, -88.58], test: [41.3465, -88.8424],
      lookup: { layer: 0, idField: 'PIN', owner: 'TAXNAME', county: 'LaSalle County' } },
    { id: 'madison', label: 'Madison County, IL',
      service: 'https://gisportal.co.madison.il.us/servera/rest/services/CCAO/Parcel_Owners/MapServer',
      lineLayer: 0, restyle: true, minZoom: 16,
      bbox: [38.65, -90.28, 39.01, -89.59], test: [38.8129, -89.9535],
      lookup: { layer: 0, idField: 'PIN', owner: 'OWN_FULL', county: 'Madison County' } },
    /* A parcel-fabric LINE layer: it keeps its own style and has no lot to
       look up. */
    { id: 'logan', label: 'Logan County, IL',
      service: 'https://www.centralilmaps.com/arcgis/rest/services/Logan/Logan_PropertyAnno/MapServer',
      lineLayer: 2, restyle: false, minZoom: 14,
      bbox: [39.91, -89.61, 40.33, -89.13], test: [40.1484, -89.3647] },
    { id: 'adams', label: 'Adams County, IL',
      service: 'https://www.adamscountyarcserver.com/adamscountyarcserver/rest/services/Adams_County_Basemap_Complete/MapServer',
      lineLayer: 13, restyle: true, minZoom: 15,
      bbox: [39.75, -91.52, 40.20, -90.91], test: [39.9343, -91.4072],
      lookup: { layer: 13, idField: 'PIN', owner: 'OwnerName', county: 'Adams County' } },
    /* The service name carries a date; expect it to move at the next refresh. */
    { id: 'coles', label: 'Coles County, IL',
      service: 'https://www.colesco.illinois.gov/arcgis/rest/services/ColesCounty/ColesParcels_2026_02_20/MapServer',
      lineLayer: 0, restyle: true, minZoom: 15,
      bbox: [39.37, -88.48, 39.69, -87.95], test: [39.4961, -88.1762],
      lookup: { layer: 0, idField: 'PIN', owner: 'DEEDNAME', county: 'Coles County' } },
    /* The City of Galesburg's server; its layer covers all of Knox County. */
    { id: 'knox', label: 'Knox County, IL',
      service: 'https://gis.ci.galesburg.il.us/server/rest/services/ParcelSearch/MapServer',
      lineLayer: 33, restyle: true, minZoom: 17,
      bbox: [40.71, -90.45, 41.16, -89.98], test: [40.9447, -90.37],
      lookup: { layer: 33, idField: 'CoGData.DBO.CADASTRAL_PARCEL_POLYGONS.PIN', owner: null, county: 'Knox County' } },
    { id: 'lee', label: 'Lee County, IL',
      service: 'https://gis.leecountyil.gov/leecogis/rest/services/Parcel_Polygons/MapServer',
      lineLayer: 0, restyle: true, minZoom: 15,
      bbox: [41.57, -89.64, 41.92, -88.93], test: [41.8445, -89.4843],
      lookup: { layer: 0, idField: 'leecogis_LEE_Parcel_Poly_PIN', owner: 'dbo_gis_data_owner1_name', county: 'Lee County' } },
    { id: 'boone', label: 'Boone County, IL',
      service: 'https://maps.boonecountyil.org/arcgis/rest/services/Assessment_Parcels/MapServer',
      lineLayer: 0, restyle: true, minZoom: 15,
      bbox: [42.15, -88.95, 42.50, -88.70], test: [42.2585, -88.8445],
      lookup: { layer: 0, idField: 'pin', owner: null, county: 'Boone County' } },
    /* The City of Rockford's server: lines are ALL_PARCELS (15), owners
       ParcelOwnership (13), both county-wide. */
    { id: 'winnebago', label: 'Winnebago County, IL',
      service: 'https://rockgis.rockfordil.gov/arcgissvr/rest/services/Rockford_IL_MapService/MapServer',
      lineLayer: 15, restyle: true, minZoom: 15,
      bbox: [42.14, -89.41, 42.51, -88.93], test: [42.2711, -89.0957],
      lookup: { layer: 13, idField: 'PIN', owner: 'OwnerLastName', county: 'Winnebago County' } },
    { id: 'nc', label: 'North Carolina (statewide)',
      service: 'https://services.nconemap.gov/secure/rest/services/NC1Map_Parcels/MapServer',
      lineLayer: 1, restyle: true, minZoom: 14,
      bbox: [33.84, -84.33, 36.59, -75.45], test: [35.7796, -78.6382] },
    { id: 'nj', label: 'New Jersey (statewide)',
      service: 'https://maps.nj.gov/arcgis/rest/services/Framework/Cadastral/MapServer',
      lineLayer: 0, restyle: true, minZoom: 14,
      bbox: [38.92, -75.57, 41.36, -73.88], test: [40.7357, -74.1724] },
    /* The state publishes only the counties that agreed to share: Erie,
       Onondaga, Albany and Tompkins draw; Monroe and Saratoga do not. */
    { id: 'ny', label: 'New York (participating counties)',
      service: 'https://gisservices.its.ny.gov/arcgis/rest/services/NYS_Tax_Parcels_Public/MapServer',
      lineLayer: 1, restyle: true, minZoom: 14,
      bbox: [40.49, -79.77, 45.02, -71.79], test: [42.6526, -73.7562] },
    { id: 'de', label: 'Delaware (statewide)',
      service: 'https://enterprise.firstmap.delaware.gov/arcgis/rest/services/PlanningCadastre/DE_StateParcels/MapServer',
      lineLayer: 0, restyle: true, minZoom: 15,
      bbox: [38.45, -75.79, 39.84, -75.04], test: [39.1582, -75.5244] },
    /* ── Statewide, found and verified 2026-10-03 (two z17 tiles each, in
       different parts of the state). Idaho's IDWR layer is left out: its
       description says the data "cannot be shared outside IDWR". Hosted
       FeatureServers only (no /export to draw from): Connecticut, Indiana,
       Utah, Tennessee, North Dakota, Alaska, Iowa (2017). Nothing public:
       Georgia, South Carolina, Alabama, Louisiana, Michigan, Kentucky,
       Kansas, Oklahoma, South Dakota, Arizona, Wyoming, New Mexico (draws
       only in its own projection). ── */
    { id: 'wv', label: 'West Virginia (statewide)',
      service: 'https://services.wvgis.wvu.edu/arcgis/rest/services/Planning_Cadastre/WV_Parcels/MapServer',
      lineLayer: 0, restyle: true, minZoom: 14,
      bbox: [37.16, -82.71, 40.64, -77.65], test: [38.3498, -81.6326] },
    { id: 'tx', label: 'Texas (statewide)',
      service: 'https://feature.geographic.texas.gov/arcgis/rest/services/Parcels/stratmap_land_parcels_48_most_recent/MapServer',
      lineLayer: 0, restyle: true, minZoom: 14,
      bbox: [25.83, -106.65, 36.51, -93.50], test: [30.2672, -97.7431] },
    /* Its own style (no dynamicLayers). */
    { id: 'ar', label: 'Arkansas (statewide)',
      service: 'https://gis.arkansas.gov/arcgis/rest/services/FEATURESERVICES/Planning_Cadastre/MapServer',
      lineLayer: 6, restyle: false, minZoom: 15,
      bbox: [32.96, -94.62, 36.54, -89.62], test: [34.7556, -92.3157] },
    { id: 'hi', label: 'Hawaii (statewide)',
      service: 'https://geodata.hawaii.gov/arcgis/rest/services/ParcelsZoning/MapServer',
      lineLayer: 25, restyle: true, minZoom: 15,
      bbox: [18.89, -160.56, 22.24, -154.73], test: [21.3069, -157.8583] },
    /* Its own style (no dynamicLayers). */
    { id: 'va', label: 'Virginia (statewide)',
      service: 'https://vginmaps.vdem.virginia.gov/arcgis/rest/services/VA_Base_Layers/VA_Parcels/MapServer',
      lineLayer: 0, restyle: false, minZoom: 15,
      bbox: [36.53, -83.68, 39.47, -75.23], test: [37.5407, -77.436] },
    { id: 'ma', label: 'Massachusetts (statewide)',
      service: 'https://arcgisserver.digital.mass.gov/arcgisserver/rest/services/AGOL/L3_Parcels_FeatureService_102100/MapServer',
      lineLayer: 1, restyle: true, minZoom: 14,
      bbox: [41.23, -73.54, 42.89, -69.89], test: [42.3601, -71.0589] },
    { id: 'md', label: 'Maryland (statewide)',
      service: 'https://mdgeodata.md.gov/imap/rest/services/PlanningCadastre/MD_ParcelBoundaries/MapServer',
      lineLayer: 0, restyle: true, minZoom: 15,
      bbox: [37.91, -79.49, 39.73, -75.04], test: [38.9784, -76.4922] },
    { id: 'ri', label: 'Rhode Island (statewide)',
      service: 'https://risegis.ri.gov/hosting/rest/services/RIDEM/Tax_Parcels/MapServer',
      lineLayer: 0, restyle: true, minZoom: 14,
      bbox: [41.14, -71.90, 42.02, -71.12], test: [41.824, -71.4128] },
    /* The ANR inventory service's parcel layer, its own style; VCGI's is a
       hosted FeatureServer only. */
    { id: 'vt', label: 'Vermont (statewide)',
      service: 'https://anrmaps.vermont.gov/arcgis/rest/services/map_services/MAP_ANR_ANRINVENTORYCONSERVATION_WM_NOCACHE/MapServer',
      lineLayer: 5, restyle: false, minZoom: 14,
      bbox: [42.72, -73.46, 45.02, -71.46], test: [44.2601, -72.5754] },
    /* Towns that share; layer 2 (lines where a town has no polygons) is not
       drawn. */
    { id: 'nh', label: 'New Hampshire (statewide mosaic, participating towns)',
      service: 'https://nhgeodata.unh.edu/nhgeodata/rest/services/CAD/ParcelMosaic/MapServer',
      lineLayer: 1, restyle: true, minZoom: 15,
      bbox: [42.66, -72.60, 45.46, -68.72], test: [43.2081, -71.5376] },
    /* The state's organized-towns layer as mirrored by Maine Coast Heritage
       Trust; the state's own hosts carry only the Unorganized Territory. */
    { id: 'me', label: 'Maine (organized towns)',
      service: 'https://gis.mcht.org/arcgis/rest/services/Cadastral_Planning/MEGIS_Parcels_Organized/MapServer',
      lineLayer: 0, restyle: true, minZoom: 14,
      bbox: [42.97, -71.14, 47.37, -66.84], test: [44.3106, -69.7795] },
    { id: 'oh', label: 'Ohio (statewide)',
      service: 'https://gis.ohiodnr.gov/arcgis/rest/services/OIT_Services/odnr_landbase/MapServer',
      lineLayer: 4, restyle: true, minZoom: 14,
      bbox: [38.40, -84.83, 41.98, -80.51], test: [39.9612, -82.9988] },
    /* The county tax parcels' dynamic service, from z18: the cached twin
       draws from z14 but bakes an owner name onto every lot. */
    { id: 'wi', label: 'Wisconsin (statewide)',
      service: 'https://dnrmaps.wi.gov/arcgis/rest/services/DW_Map_Dynamic/EN_County_Tax_Parcels_WTM_Ext_Dynamic_L16/MapServer',
      lineLayer: 0, restyle: true, minZoom: 18,
      bbox: [42.45, -92.97, 47.09, -86.66], test: [43.07, -89.4] },
    { id: 'mn', label: 'Minnesota (opt-in counties)',
      service: 'https://enterprise.gisdata.mn.gov/aghost/rest/services/us_mn_state_mngeo/plan_parcels_open/MapServer',
      lineLayer: 1, restyle: true, minZoom: 15,
      bbox: [43.43, -97.25, 49.41, -89.39], test: [44.9778, -93.265] },
    { id: 'ne', label: 'Nebraska (statewide)',
      service: 'https://gis.ne.gov/Enterprise/rest/services/StatewideParcelsExternal/MapServer',
      lineLayer: 0, restyle: true, minZoom: 15,
      bbox: [39.90, -104.19, 43.08, -95.09], test: [40.8136, -96.7026] },
    /* DEP's copy of the statewide cadastral; FDOR's newer one is a hosted
       FeatureServer only. */
    { id: 'fl', label: 'Florida (statewide)',
      service: 'https://ca.dep.state.fl.us/arcgis/rest/services/Map_Direct/Boundaries/MapServer',
      lineLayer: 16, restyle: true, minZoom: 15,
      bbox: [24.41, -87.64, 31.05, -79.77], test: [30.455, -84.27] },
    { id: 'co', label: 'Colorado (participating counties)',
      service: 'https://gis.colorado.gov/public/rest/services/Address_and_Parcel/Colorado_Public_Parcels/MapServer',
      lineLayer: 0, restyle: true, minZoom: 15,
      bbox: [36.99, -109.07, 41.01, -102.04], test: [39.7392, -104.9903] },
    { id: 'mt', label: 'Montana (statewide)',
      service: 'https://gisservice.mt.gov/arcgis/rest/services/msdi_cadastral_map_v1/MapServer',
      lineLayer: 1, restyle: true, minZoom: 14,
      bbox: [44.23, -116.18, 49.19, -103.61], test: [46.5891, -112.0391] },
    { id: 'wa', label: 'Washington (statewide)',
      service: 'https://gis.dnr.wa.gov/site2/rest/services/Public_Forest_Practices/WADNR_PUBLIC_OCIO_Parcels/MapServer',
      lineLayer: 0, restyle: true, minZoom: 15,
      bbox: [45.48, -124.93, 49.05, -116.71], test: [47.0379, -122.9007] },
    /* A statewide snapshot as of 2018-12-31. */
    { id: 'nv', label: 'Nevada (statewide, 2018)',
      service: 'https://gis.dot.nv.gov/agsphs/rest/services/Reference/Statewide_Parcels/MapServer',
      lineLayer: 0, restyle: true, minZoom: 14,
      bbox: [34.98, -120.14, 42.04, -113.79], test: [39.5296, -119.8138] },
    /* One layer per half of the state, each boxed to its own extent (the
       server's, in degrees) so a tile asks one half, not both: the server
       is slow, 15-30 s a tile. */
    { id: 'msw', label: 'Mississippi (statewide, west)',
      service: 'https://gis.mississippi.edu/server/rest/services/Cadastral/MS_Parcels_August_2024/MapServer',
      lineLayer: 1, restyle: true, minZoom: 14,
      bbox: [30.99, -91.71, 35.00, -89.36], test: [32.2988, -90.1848] },
    { id: 'mse', label: 'Mississippi (statewide, east)',
      service: 'https://gis.mississippi.edu/server/rest/services/Cadastral/MS_Parcels_August_2024/MapServer',
      lineLayer: 2, restyle: true, minZoom: 14,
      bbox: [30.17, -90.00, 35.01, -88.09], test: [32.3643, -88.7037] },
    /* One layer per county (0–35), drawn together in their own style:
       restyling all 36 makes a URL the server refuses. */
    { id: 'or', label: 'Oregon (statewide, county taxlots)',
      service: 'https://gis.odf.oregon.gov/ags1/rest/services/WebMercator/TaxlotsDisplay/MapServer',
      lineLayer: '0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35', restyle: false, minZoom: 14,
      bbox: [41.96, -124.58, 46.31, -116.43], test: [44.9429, -123.0351] },
    /* ── California and Pennsylvania statewide, and the largest metro
       counties elsewhere, found and verified 2026-10-03 (a z17 tile at
       `test`; outline-only yellow where `restyle`, which several need
       because their own style fills each lot). Reached once and not on the
       re-check (connection failures from our network, so not added yet):
       Dallas County TX, Hamilton County OH, King County WA, all inside a
       state that draws. Not public or not reachable: Santa Clara,
       Alameda, Fresno and San Bernardino (inside California's layer),
       Bexar, Collin, Cuyahoga, Wayne, Fulton, DeKalb GA, Denver, Shelby,
       Duval. ── */
    /* The state's own parcel layer (CA OCIO), its own style; every county
       below draws its own lines over it, and answers the point lookup. */
    { id: 'ca', label: 'California (statewide)',
      service: 'https://services.gis.ca.gov/arcgis/rest/services/Boundaries/UCD_Parcels/MapServer',
      lineLayer: 0, restyle: false, minZoom: 14,
      bbox: [32.53, -124.49, 42.01, -114.13], test: [37.3382, -121.8863] },
    { id: 'lacounty', label: 'Los Angeles County, CA',
      service: 'https://public.gis.lacounty.gov/public/rest/services/LACounty_Cache/LACounty_Parcel/MapServer',
      lineLayer: 0, restyle: false, minZoom: 15,
      bbox: [32.79, -118.96, 34.83, -117.64], test: [34.0505, -118.255],
      lookup: { layer: 0, idField: 'APN', owner: null, county: 'Los Angeles County' } },
    /* Its point query timed out when tried, so no lookup. */
    { id: 'sandiego', label: 'San Diego County, CA',
      service: 'https://gis-public.sandiegocounty.gov/arcgis/rest/services/cosd_warehouse/parcels_all_for_public_use/MapServer',
      lineLayer: 0, restyle: true, minZoom: 14,
      bbox: [32.53, -117.60, 33.52, -116.08], test: [32.748, -117.13] },
    { id: 'orange', label: 'Orange County, CA',
      service: 'https://www.ocgis.com/arcpub/rest/services/Map_Layers/Parcels/MapServer',
      lineLayer: 0, restyle: true, minZoom: 16,
      bbox: [33.38, -118.13, 33.96, -117.40], test: [33.74398, -117.86615],
      lookup: { layer: 0, idField: 'ASSESSMENT_NO', owner: null, county: 'Orange County' } },
    { id: 'riverside', label: 'Riverside County, CA',
      service: 'https://gis.countyofriverside.us/arcgis_mapping/rest/services/OpenData/Assessor/MapServer',
      lineLayer: 40, restyle: true, minZoom: 15,
      bbox: [33.41, -117.68, 34.10, -114.43], test: [33.9806, -117.3755],
      lookup: { layer: 40, idField: 'APN', owner: null, county: 'Riverside County' } },
    { id: 'sacramento', label: 'Sacramento County, CA',
      service: 'https://mapservices.gis.saccounty.net/arcgis/rest/services/PARCELS/MapServer',
      lineLayer: 3, restyle: true, minZoom: 16,
      bbox: [38.01, -121.86, 38.74, -121.01], test: [38.5795, -121.493],
      lookup: { layer: 3, idField: 'APN_DASH', owner: null, county: 'Sacramento County' } },
    { id: 'harris', label: 'Harris County, TX',
      service: 'https://arcweb.hcad.org/server/rest/services/public/public_query/MapServer',
      lineLayer: 0, restyle: true, minZoom: 15,
      bbox: [29.49, -95.98, 30.19, -94.89], test: [29.759, -95.364],
      lookup: { layer: 0, idField: 'HCAD_NUM', owner: 'owner', county: 'Harris County' } },
    { id: 'tarrant', label: 'Tarrant County, TX',
      service: 'https://mapit.tarrantcounty.com/arcgis/rest/services/Dynamic/TADParcels/MapServer',
      lineLayer: 0, restyle: true, minZoom: 15,
      bbox: [32.54, -97.56, 33.00, -97.03], test: [32.753, -97.333],
      lookup: { layer: 0, idField: 'ACCOUNT', owner: 'OWNER_NAME', county: 'Tarrant County' } },
    { id: 'travis', label: 'Travis County, TX',
      service: 'https://gis.traviscountytx.gov/server1/rest/services/Boundaries_and_Jurisdictions/TCAD_public/MapServer',
      lineLayer: 0, restyle: true, minZoom: 14,
      bbox: [30.01, -98.20, 30.65, -97.36], test: [30.27, -97.745],
      lookup: { layer: 0, idField: 'PROP_ID', owner: null, county: 'Travis County' } },
    { id: 'maricopa', label: 'Maricopa County, AZ',
      service: 'https://gis.mcassessor.maricopa.gov/arcgis/rest/services/Parcels/MapServer',
      lineLayer: 0, restyle: true, minZoom: 16,
      bbox: [32.69, -113.34, 34.05, -111.08], test: [33.471, -112.079],
      lookup: { layer: 0, idField: 'APN', owner: 'OWNER_NAME', county: 'Maricopa County' } },
    /* Lines are layer 2; the lots to look up are layer 12. */
    { id: 'pima', label: 'Pima County, AZ',
      service: 'https://gisdata.pima.gov/arcgis1/rest/services/GISOpenData/LandRecords/MapServer',
      lineLayer: 2, restyle: false, minZoom: 15,
      bbox: [31.41, -113.35, 32.53, -110.43], test: [32.235, -110.96],
      lookup: { layer: 12, idField: 'PARCEL', owner: null, county: 'Pima County' } },
    { id: 'clark', label: 'Clark County, NV',
      service: 'https://maps.clarkcountynv.gov/arcgis/rest/services/Assessor/LandApp/MapServer',
      lineLayer: 9, restyle: false, minZoom: 15,
      bbox: [34.99, -115.90, 36.86, -114.03], test: [36.17, -115.13],
      lookup: { layer: 9, idField: 'APN', owner: null, county: 'Clark County' } },
    { id: 'franklin', label: 'Franklin County, OH',
      service: 'https://gis.franklincountyohio.gov/hosting/rest/services/ParcelFeatures/Parcel_Features_WebMercator/MapServer',
      lineLayer: 0, restyle: true, minZoom: 16,
      bbox: [39.79, -83.27, 40.15, -82.76], test: [39.965, -82.99],
      lookup: { layer: 0, idField: 'PARCELID', owner: 'OWNERNME1', county: 'Franklin County' } },
    { id: 'oakland', label: 'Oakland County, MI',
      service: 'https://gisservices.oakgov.com/arcgis/rest/services/Enterprise/EnterpriseOpenParcelDataMapService/MapServer',
      lineLayer: 1, restyle: true, minZoom: 14,
      bbox: [42.42, -83.70, 42.90, -83.07], test: [42.4895, -83.1446],
      lookup: { layer: 1, idField: 'PIN', owner: null, county: 'Oakland County' } },
    /* PA DEP's statewide layer: Philadelphia and Allegheny included. */
    { id: 'pa', label: 'Pennsylvania (statewide)',
      service: 'https://gis.dep.pa.gov/depgisprd/rest/services/Parcels/PA_Parcels/MapServer',
      lineLayer: 0, restyle: true, minZoom: 15,
      bbox: [39.71, -80.52, 42.01, -74.72], test: [39.95, -75.17],
      lookup: { layer: 0, idField: 'PARCEL_ID', owner: 'OWNER_NAME', county: 'Pennsylvania' } },
    { id: 'allegheny', label: 'Allegheny County, PA',
      service: 'https://gisdata.alleghenycounty.us/arcgis/rest/services/OPENDATA/Parcels/MapServer',
      lineLayer: 0, restyle: true, minZoom: 15,
      bbox: [40.18, -80.38, 40.69, -79.67], test: [40.4435, -79.998],
      lookup: { layer: 0, idField: 'PIN', owner: null, county: 'Allegheny County' } },
    { id: 'hennepin', label: 'Hennepin County, MN',
      service: 'https://gis.hennepin.us/arcgis/rest/services/HennepinData/LAND_PROPERTY/MapServer',
      lineLayer: 1, restyle: true, minZoom: 15,
      bbox: [44.78, -93.78, 45.25, -93.17], test: [44.976, -93.27],
      lookup: { layer: 1, idField: 'PID', owner: 'OWNER_NM', county: 'Hennepin County' } },
    { id: 'jackson', label: 'Jackson County, MO',
      service: 'https://jcgis.jacksongov.org/arcgis/rest/services/ParcelViewer/ParcelsAscendRelate/MapServer',
      lineLayer: 1, restyle: true, minZoom: 15,
      bbox: [38.83, -94.61, 39.24, -94.10], test: [39.0997, -94.5786],
      lookup: { layer: 1, idField: 'Name', owner: null, county: 'Jackson County' } },
    { id: 'stlouisco', label: 'St. Louis County, MO',
      service: 'https://maps.stlouisco.com/hosting/rest/services/Maps/AGS_Parcels/MapServer',
      lineLayer: 0, restyle: true, minZoom: 15,
      bbox: [38.39, -90.75, 38.90, -90.12], test: [38.6426, -90.3237],
      lookup: { layer: 0, idField: 'LOCATOR', owner: 'OWNER_NAME', county: 'St. Louis County' } },
    { id: 'marion', label: 'Marion County, IN',
      service: 'https://gis.indy.gov/server/rest/services/MapIndy/MapIndyProperty/MapServer',
      lineLayer: 10, restyle: true, minZoom: 16,
      bbox: [39.63, -86.33, 39.93, -85.93], test: [39.7684, -86.1581],
      lookup: { layer: 10, idField: 'STATEPARCELNUMBER', owner: null, county: 'Marion County' } },
    { id: 'davidson', label: 'Davidson County, TN',
      service: 'https://maps.nashville.gov/arcgis/rest/services/Cadastral/Parcels/MapServer',
      lineLayer: 0, restyle: true, minZoom: 16,
      bbox: [35.96, -87.06, 36.41, -86.51], test: [36.16, -86.78],
      lookup: { layer: 0, idField: 'APN', owner: 'Owner', county: 'Davidson County' } },
    { id: 'jefferson', label: 'Jefferson County, KY',
      service: 'https://gis.lojic.org/maps/rest/services/LojicSolutions/OpenDataPVA/MapServer',
      lineLayer: 1, restyle: true, minZoom: 15,
      bbox: [37.99, -85.96, 38.39, -85.40], test: [38.2527, -85.7585],
      lookup: { layer: 1, idField: 'PARCELID', owner: null, county: 'Jefferson County' } },
    { id: 'saltlake', label: 'Salt Lake County, UT',
      service: 'https://apps.saltlakecounty.gov/arcgis/rest/services/Land/MapServer',
      lineLayer: 1, restyle: true, minZoom: 16,
      bbox: [40.41, -112.24, 40.93, -111.55], test: [40.7608, -111.891],
      lookup: { layer: 1, idField: 'parcel_id', owner: 'own_name', county: 'Salt Lake County' } },
    /* Portland Metro's taxlots: Multnomah, Washington and Clackamas. */
    { id: 'multnomah', label: 'Portland Metro (Multnomah, Washington, Clackamas), OR',
      service: 'https://www.portlandmaps.com/arcgis/rest/services/Public/Taxlots/MapServer',
      lineLayer: 0, restyle: true, minZoom: 16,
      bbox: [44.88, -123.49, 45.79, -121.65], test: [45.5152, -122.6784],
      lookup: { layer: 0, idField: 'STATE_ID', owner: 'OWNER1', county: 'Multnomah County' } },
    { id: 'hillsborough', label: 'Hillsborough County, FL',
      service: 'https://gis.hcpafl.org/arcgis/rest/services/Webmaps/HillsboroughFL_TaxMap_Prod/MapServer',
      lineLayer: 1, restyle: true, minZoom: 16,
      bbox: [27.52, -82.88, 28.18, -82.05], test: [27.94, -82.475],
      lookup: { layer: 1, idField: 'FOLIO', owner: 'NameLabel', county: 'Hillsborough County' } },
    { id: 'miamidade', label: 'Miami-Dade County, FL',
      service: 'https://gisweb.miamidade.gov/arcgis/rest/services/MD_LandInformation/MapServer',
      lineLayer: 26, restyle: true, minZoom: 17,
      bbox: [25.13, -80.88, 25.98, -80.11], test: [25.77, -80.195],
      lookup: { layer: 26, idField: 'FOLIO', owner: 'TRUE_OWNER1', county: 'Miami-Dade County' } }
  ];

  /* The server asks these for the parcel under a point, in this order:
     tightest box first, Cook last (its box holds DuPage's). */
  var LOOKUP_ORDER = ['dupage', 'lake', 'peoria', 'kane', 'sangamon', 'mclean', 'stclair', 'macon', 'tazewell', 'grundy', 'lasalle', 'madison', 'adams', 'coles', 'knox', 'lee', 'boone', 'winnebago',
    'lacounty', 'orange', 'riverside', 'sacramento', 'harris', 'tarrant', 'travis', 'maricopa', 'pima', 'clark', 'franklin', 'oakland', 'allegheny', 'hennepin', 'jackson', 'stlouisco', 'marion', 'davidson', 'jefferson', 'saltlake', 'multnomah', 'hillsborough', 'miamidade', 'pa', 'cook'];

  /* One line style for every layer that takes one: a warm yellow that reads
     on satellite and on the light basemap, never an editor colour. */
  var LINE_RGBA = [255, 214, 10, 255];
  var LINE_WIDTH = 1.5;

  var MERC = 20037508.342789244;

  function byId(id) {
    for (var i = 0; i < SOURCES.length; i++) if (SOURCES[i].id === id) return SOURCES[i];
    return null;
  }

  /* An XYZ tile → its EPSG:3857 box [minX, minY, maxX, maxY], which is what
     ArcGIS export wants. */
  function tileBbox(x, y, z) {
    var span = (2 * MERC) / Math.pow(2, z);
    var minX = -MERC + x * span, maxY = MERC - y * span;
    return [minX, maxY - span, minX + span, maxY];
  }

  function latOfY(y) { return (2 * Math.atan(Math.exp(y / 6378137)) - Math.PI / 2) * 180 / Math.PI; }
  function lngOfX(x) { return x / 6378137 * 180 / Math.PI; }

  /* The same tile as [south, west, north, east] in degrees. */
  function tileBox(x, y, z) {
    var b = tileBbox(x, y, z);
    return [latOfY(b[1]), lngOfX(b[0]), latOfY(b[3]), lngOfX(b[2])];
  }

  function overlaps(a, b) {
    return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
  }

  function contains(b, lat, lng) {
    return lat >= b[0] && lat <= b[2] && lng >= b[1] && lng <= b[3];
  }

  /* The layers whose box holds a point. */
  function at(lat, lng) {
    var out = [];
    for (var i = 0; i < SOURCES.length; i++) if (contains(SOURCES[i].bbox, lat, lng)) out.push(SOURCES[i]);
    return out;
  }

  /* The layers whose box touches a view [south, west, north, east]. */
  function within(box) {
    var out = [];
    for (var i = 0; i < SOURCES.length; i++) if (overlaps(SOURCES[i].bbox, box)) out.push(SOURCES[i]);
    return out;
  }

  /* dynamicLayers: the source's own line layer, outline only, labels off. */
  function lineStyle(layerId) {
    return JSON.stringify([{
      id: layerId,
      source: { type: 'mapLayer', mapLayerId: layerId },
      drawingInfo: {
        showLabels: false,
        renderer: { type: 'simple', symbol: {
          type: 'esriSFS', style: 'esriSFSNull',
          outline: { type: 'esriSLS', style: 'esriSLSSolid', color: LINE_RGBA, width: LINE_WIDTH } } }
      }
    }]);
  }

  /* The picture of one tile of one layer, or null when there is nothing to
     ask for: a row off the world, a zoom the layer does not draw at, or a
     tile outside the layer's box. Google asks for tiles past the date line at
     low zoom, so x is wrapped. */
  function tileUrl(src, x, y, z) {
    if (!src || !(z >= 0)) return null;
    var n = Math.pow(2, z);
    if (y < 0 || y >= n) return null;
    if (z < (src.minZoom || 0)) return null;
    x = ((x % n) + n) % n;
    if (!overlaps(src.bbox, tileBox(x, y, z))) return null;
    var bb = tileBbox(x, y, z);
    var which = src.restyle
      ? 'dynamicLayers=' + encodeURIComponent(lineStyle(src.lineLayer))
      : 'layers=' + encodeURIComponent('show:' + src.lineLayer);
    return src.service + '/export'
      + '?bbox=' + bb.join('%2C')
      + '&bboxSR=3857&imageSR=3857&size=256%2C256'
      + '&' + which
      + '&format=png32&transparent=true&f=image';
  }

  /* What api/parcel.js reads as its PARCELS: key → { url, idField, owner,
     label, bbox }, url being the polygon layer it queries. */
  function lookupLayers() {
    var out = {};
    for (var i = 0; i < LOOKUP_ORDER.length; i++) {
      var s = byId(LOOKUP_ORDER[i]);
      out[s.id] = { url: s.service + '/' + s.lookup.layer, idField: s.lookup.idField,
                    owner: s.lookup.owner, label: s.lookup.county, bbox: s.bbox.slice() };
    }
    return out;
  }

  /* A point inside a ring of [lat, lng]: even-odd ray casting. */
  function inRing(ring, lat, lng) {
    if (!ring || ring.length < 3) return false;
    var inside = false;
    for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      var yi = ring[i][0], xi = ring[i][1], yj = ring[j][0], xj = ring[j][1];
      if ((yi > lat) !== (yj > lat) && lng < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  return {
    SOURCES: SOURCES, LOOKUP_ORDER: LOOKUP_ORDER, LINE_RGBA: LINE_RGBA, LINE_WIDTH: LINE_WIDTH,
    byId: byId, at: at, within: within, tileBbox: tileBbox, tileBox: tileBox,
    tileUrl: tileUrl, lineStyle: lineStyle, lookupLayers: lookupLayers, inRing: inRing
  };
});
