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
    /* CT ECO publishes one polygon layer per town. Select only towns touching
       each tile: exporting all 169 dynamic layers exceeds normal URL limits.
       Verified 2026-10-05; municipal map vintages vary. Point records use the
       state's separate 2025 collection, not the older display attribution. */
    { id: 'ct', label: 'Connecticut (CT ECO municipal parcels)',
      service: 'https://cteco.uconn.edu/ctmaps/rest/services/Parcels/Parcels_tiled/MapServer',
      lineLayer: 40, restyle: true, minZoom: 15,
      bbox: [40.98, -73.74, 42.06, -71.78], test: [41.177, -73.17],
      lookup: { service: 'https://services3.arcgis.com/3FL1kr7L4LvwA2Kb/arcgis/rest/services/Connecticut_CAMA_and_Parcel_Layer_2025/FeatureServer',
        layer: 0, idField: 'Parcel_ID', owner: 'Owner', county: 'Connecticut' },
      parts: [
        { layer: 1, bbox: [41.6964, -72.4232, 41.7675, -72.3281] }, // Andover
        { layer: 2, bbox: [41.7579, -72.9279, 41.825, -72.7971] }, // Avon
        { layer: 3, bbox: [41.5538, -72.8399, 41.6527, -72.711] }, // Berlin
        { layer: 4, bbox: [41.8002, -72.7989, 41.9062, -72.6855] }, // Bloomfield
        { layer: 5, bbox: [41.7271, -72.474, 41.807, -72.4035] }, // Bolton
        { layer: 6, bbox: [41.8055, -72.9547, 41.9216, -72.8701] }, // Canton
        { layer: 7, bbox: [41.6435, -72.357, 41.7386, -72.2395] }, // Columbia
        { layer: 8, bbox: [41.7176, -72.4219, 41.8384, -72.2491] }, // Coventry
        { layer: 9, bbox: [41.8925, -72.7859, 41.9863, -72.6876] }, // East Granby
        { layer: 10, bbox: [41.7246, -72.6647, 41.8006, -72.5711] }, // East Hartford
        { layer: 11, bbox: [41.8674, -72.6226, 41.9455, -72.5136] }, // East Windsor
        { layer: 12, bbox: [41.8565, -72.5186, 41.9576, -72.3061] }, // Ellington
        { layer: 13, bbox: [41.9342, -72.6215, 42.0347, -72.4927] }, // Enfield
        { layer: 14, bbox: [41.6878, -72.9091, 41.7764, -72.762] }, // Farmington
        { layer: 15, bbox: [41.6327, -72.6489, 41.7458, -72.4518] }, // Glastonbury
        { layer: 16, bbox: [41.918, -72.9069, 42.0376, -72.763] }, // Granby
        { layer: 17, bbox: [41.7236, -72.7183, 41.8106, -72.642] }, // Hartford
        { layer: 18, bbox: [41.5885, -72.4609, 41.7318, -72.3235] }, // Hebron
        { layer: 19, bbox: [41.7335, -72.5842, 41.8206, -72.4635] }, // Manchester
        { layer: 20, bbox: [41.7281, -72.3169, 41.8363, -72.1562] }, // Mansfield
        { layer: 21, bbox: [41.5836, -72.5057, 41.6887, -72.4075] }, // Marlborough
        { layer: 22, bbox: [41.6454, -72.8241, 41.7159, -72.7503] }, // New Britain
        { layer: 23, bbox: [41.6468, -72.7624, 41.7243, -72.7004] }, // Newington
        { layer: 24, bbox: [41.6494, -72.893, 41.6981, -72.8153] }, // Plainville
        { layer: 25, bbox: [41.6275, -72.7155, 41.688, -72.6101] }, // Rocky Hill
        { layer: 26, bbox: [41.8161, -72.8766, 41.9208, -72.7589] }, // Simsbury
        { layer: 27, bbox: [41.9471, -72.5088, 42.0345, -72.3975] }, // Somers
        { layer: 28, bbox: [41.5448, -72.9459, 41.6561, -72.8141] }, // Southington
        { layer: 29, bbox: [41.7975, -72.6464, 41.8703, -72.4972] }, // South Windsor
        { layer: 30, bbox: [41.9396, -72.4076, 42.0332, -72.2031] }, // Stafford
        { layer: 31, bbox: [41.943, -72.7796, 42.037, -72.6047] }, // Suffield
        { layer: 32, bbox: [41.8244, -72.4323, 41.93, -72.2905] }, // Tolland
        { layer: 33, bbox: [41.7982, -72.5078, 41.8748, -72.4181] }, // Vernon
        { layer: 34, bbox: [41.7185, -72.8007, 41.8066, -72.714] }, // West Hartford
        { layer: 35, bbox: [41.6689, -72.7083, 41.7299, -72.616] }, // Wethersfield
        { layer: 36, bbox: [41.8352, -72.3123, 41.9586, -72.216] }, // Willington
        { layer: 37, bbox: [41.8013, -72.7433, 41.9285, -72.6205] }, // Windsor
        { layer: 38, bbox: [41.8998, -72.6961, 41.9483, -72.6163] }, // Windsor Locks
        { layer: 40, bbox: [41.1414, -73.2442, 41.2297, -73.1535] }, // Bridgeport
        { layer: 41, bbox: [41.2118, -73.3691, 41.332, -73.2348] }, // Easton
        { layer: 42, bbox: [41.1175, -73.3387, 41.2322, -73.2174] }, // Fairfield
        { layer: 43, bbox: [41.2921, -73.308, 41.3923, -73.1566] }, // Monroe
        { layer: 44, bbox: [41.1471, -73.165, 41.2693, -73.086] }, // Stratford
        { layer: 45, bbox: [41.2202, -73.2753, 41.2999, -73.1407] }, // Trumbull
        { layer: 47, bbox: [41.8325, -72.2176, 41.9594, -72.1099] }, // Ashford
        { layer: 48, bbox: [41.7422, -72.1151, 41.9573, -71.8856] }, // Brooklyn
        { layer: 49, bbox: [41.6342, -72.0622, 41.7601, -71.9136] }, // Canterbury
        { layer: 50, bbox: [41.7444, -72.1656, 41.835, -72.0921] }, // Chaplin
        { layer: 51, bbox: [41.7795, -72.1513, 41.9593, -71.9163] }, // Eastford
        { layer: 52, bbox: [41.7307, -72.1151, 41.9573, -71.9163] }, // Hampton
        { layer: 53, bbox: [41.7584, -71.9287, 41.9056, -71.7894] }, // Killingly
        { layer: 54, bbox: [41.6329, -71.9674, 41.7697, -71.8387] }, // Plainfield
        { layer: 55, bbox: [41.8045, -72.0448, 41.9169, -71.9043] }, // Pomfret
        { layer: 56, bbox: [41.8683, -71.9345, 41.9334, -71.7964] }, // Putnam
        { layer: 57, bbox: [41.6521, -72.1231, 41.7458, -72.0521] }, // Scotland
        { layer: 58, bbox: [41.6398, -71.8579, 41.775, -71.7856] }, // Sterling
        { layer: 59, bbox: [41.9303, -71.9644, 42.0263, -71.7966] }, // Thompson
        { layer: 60, bbox: [41.9583, -72.2344, 42.0311, -72.0991] }, // Union
        { layer: 61, bbox: [41.5055, -71.8845, 41.6442, -71.7876] }, // Voluntown
        { layer: 62, bbox: [41.9147, -72.1022, 42.0289, -71.9271] }, // Woodstock
        { layer: 64, bbox: [41.8872, -73.054, 41.9736, -72.8874] }, // Barkhamsted
        { layer: 65, bbox: [41.7119, -73.0171, 41.8089, -72.8983] }, // Burlington
        { layer: 66, bbox: [41.9156, -73.3734, 42.0032, -73.2445] }, // Canann
        { layer: 67, bbox: [41.9597, -73.1521, 42.0421, -73.0087] }, // Colebrook
        { layer: 68, bbox: [41.7784, -73.4154, 41.9193, -73.2616] }, // Cornwall
        { layer: 69, bbox: [41.779, -73.3025, 41.917, -73.1641] }, // Goshen
        { layer: 70, bbox: [41.9666, -73.0298, 42.0391, -72.8635] }, // Hartland
        { layer: 71, bbox: [41.7068, -73.1208, 41.7989, -72.999] }, // Harwinton
        { layer: 72, bbox: [41.6655, -73.5196, 41.7924, -73.3785] }, // Kent
        { layer: 73, bbox: [41.6726, -73.2988, 41.7943, -73.0685] }, // Litchfield
        { layer: 74, bbox: [41.6644, -73.2765, 41.7162, -73.1413] }, // Morris
        { layer: 75, bbox: [41.7979, -73.0768, 41.8953, -72.9362] }, // New Hartford
        { layer: 76, bbox: [41.9129, -73.2638, 42.0454, -73.1264] }, // Norfolk
        { layer: 77, bbox: [41.9935, -73.3597, 42.0489, -73.2325] }, // North Canaan
        { layer: 78, bbox: [41.5038, -73.3488, 41.6034, -73.2545] }, // Roxbury
        { layer: 79, bbox: [41.9178, -73.4983, 42.0512, -73.339] }, // Salisbury
        { layer: 80, bbox: [41.7877, -73.5097, 41.9227, -73.3572] }, // Sharon
        { layer: 81, bbox: [41.7755, -73.2026, 41.8947, -73.0531] }, // Torrington
        { layer: 82, bbox: [41.6965, -73.4018, 41.7815, -73.2925] }, // Warren
        { layer: 83, bbox: [41.595, -73.3842, 41.7089, -73.2534] }, // Washington
        { layer: 84, bbox: [41.8725, -73.1713, 41.9657, -73.0339] }, // Winchester
        { layer: 86, bbox: [41.3236, -73.1026, 41.3635, -73.0388] }, // Ansonia
        { layer: 87, bbox: [41.404, -73.0928, 41.469, -73.0245] }, // Beacon Falls
        { layer: 88, bbox: [41.6045, -73.2616, 41.6693, -73.1577] }, // Bethlehem
        { layer: 89, bbox: [41.6392, -72.9985, 41.7232, -72.8827] }, // Bristol
        { layer: 90, bbox: [41.4479, -72.9697, 41.5641, -72.8458] }, // Cheshire
        { layer: 91, bbox: [41.3014, -73.124, 41.3533, -73.0371] }, // Derby
        { layer: 92, bbox: [41.4875, -73.1647, 41.5702, -73.0689] }, // Middlebury
        { layer: 93, bbox: [41.4559, -73.1048, 41.5194, -72.9987] }, // Naugatuck
        { layer: 94, bbox: [41.3676, -73.2083, 41.4898, -73.0764] }, // Oxford
        { layer: 95, bbox: [41.6095, -73.0655, 41.714, -72.9828] }, // Plymouth
        { layer: 96, bbox: [41.4646, -73.0185, 41.5336, -72.9339] }, // Prospect
        { layer: 97, bbox: [41.3452, -73.1481, 41.4239, -73.041] }, // Seymour
        { layer: 98, bbox: [41.2553, -73.2052, 41.3773, -73.065] }, // Shelton
        { layer: 99, bbox: [41.4196, -73.3271, 41.5144, -73.1543] }, // Southbury
        { layer: 100, bbox: [41.6065, -73.1422, 41.7085, -73.0507] }, // Thomaston
        { layer: 101, bbox: [41.5141, -73.0945, 41.6156, -72.9567] }, // Waterbury
        { layer: 102, bbox: [41.5576, -73.1709, 41.6727, -73.0574] }, // Watertown
        { layer: 103, bbox: [41.5528, -73.0217, 41.6442, -72.933] }, // Wolcott
        { layer: 104, bbox: [41.5086, -73.2676, 41.6128, -73.1449] }, // Woodbury
        { layer: 106, bbox: [41.3763, -72.5398, 41.4339, -72.4249] }, // Chester
        { layer: 107, bbox: [41.2536, -72.5861, 41.3414, -72.4857] }, // Clinton
        { layer: 108, bbox: [41.5721, -72.716, 41.6401, -72.6115] }, // Cromwell
        { layer: 109, bbox: [41.3339, -72.524, 41.4021, -72.3827] }, // Deep River
        { layer: 110, bbox: [41.4235, -72.7462, 41.5001, -72.6078] }, // Durham
        { layer: 111, bbox: [41.4223, -72.4879, 41.5398, -72.3049] }, // East Haddam
        { layer: 112, bbox: [41.5107, -72.5643, 41.6475, -72.4303] }, // East Hampton
        { layer: 113, bbox: [41.324, -72.4729, 41.3828, -72.3691] }, // Essex
        { layer: 114, bbox: [41.4141, -72.6373, 41.5196, -72.4507] }, // Haddam
        { layer: 115, bbox: [41.3098, -72.6548, 41.4427, -72.5112] }, // Killingworth
        { layer: 116, bbox: [41.343, -72.4315, 41.441, -72.276] }, // Lyme
        { layer: 117, bbox: [41.4835, -72.7488, 41.5498, -72.6777] }, // Middlefield
        { layer: 118, bbox: [41.4947, -72.7533, 41.6042, -72.5503] }, // Middletown
        { layer: 119, bbox: [41.2776, -72.3647, 41.3671, -72.2482] }, // Old Lyme
        { layer: 120, bbox: [41.2604, -72.4332, 41.3428, -72.3425] }, // Old Saybrook
        { layer: 121, bbox: [41.555, -72.6492, 41.6429, -72.529] }, // Portland
        { layer: 122, bbox: [41.2553, -72.5139, 41.348, -72.4162] }, // Westbrook
        { layer: 124, bbox: [41.5038, -72.23, 41.5907, -72.131] }, // Bozrah
        { layer: 125, bbox: [41.5176, -72.4669, 41.619, -72.2178] }, // Colchester
        { layer: 126, bbox: [41.2854, -72.2831, 41.4438, -72.1752] }, // East Lyme
        { layer: 127, bbox: [41.563, -72.194, 41.6674, -72.1029] }, // Franklin
        { layer: 128, bbox: [41.5143, -71.9928, 41.642, -71.8625] }, // Griswold
        { layer: 129, bbox: [41.3061, -72.096, 41.4004, -71.959] }, // Groton
        { layer: 130, bbox: [41.5398, -72.3349, 41.7148, -72.1573] }, // Lebanon
        { layer: 131, bbox: [41.3975, -72.0971, 41.4884, -71.9417] }, // Ledyard
        { layer: 132, bbox: [41.5538, -72.0479, 41.6474, -71.9762] }, // Lisbon
        { layer: 133, bbox: [41.4111, -72.2431, 41.5175, -72.0711] }, // Montville
        { layer: 134, bbox: [41.2715, -72.1293, 41.387, -72.0805] }, // New London
        { layer: 135, bbox: [41.4078, -71.9686, 41.5288, -71.7927] }, // North Stonington
        { layer: 136, bbox: [41.4905, -72.141, 41.6085, -72.0397] }, // Norwich
        { layer: 137, bbox: [41.4636, -72.0809, 41.5701, -71.9019] }, // Preston
        { layer: 138, bbox: [41.4328, -72.3235, 41.5396, -72.2119] }, // Salem
        { layer: 139, bbox: [41.5948, -72.1211, 41.6624, -72.0304] }, // Sprague
        { layer: 140, bbox: [41.3097, -71.9797, 41.434, -71.8291] }, // Stonington
        { layer: 141, bbox: [41.2991, -72.2203, 41.4281, -72.095] }, // Waterford
        { layer: 142, bbox: [41.6574, -72.2537, 41.7564, -72.1121] }, // Windham
        { layer: 144, bbox: [41.3884, -73.048, 41.4702, -72.9407] }, // Bethany
        { layer: 145, bbox: [41.2408, -72.8644, 41.3242, -72.7271] }, // Branford
        { layer: 146, bbox: [41.2419, -72.9012, 41.364, -72.8174] }, // East Haven
        { layer: 147, bbox: [41.2422, -72.7475, 41.4339, -72.6315] }, // Guilford
        { layer: 148, bbox: [41.3266, -72.9759, 41.4649, -72.8513] }, // Hamden
        { layer: 149, bbox: [41.2483, -72.6813, 41.4385, -72.5341] }, // Madison
        { layer: 150, bbox: [41.4966, -72.8613, 41.5789, -72.7444] }, // Meriden
        { layer: 151, bbox: [41.1722, -73.1212, 41.277, -72.9862] }, // Milford
        { layer: 152, bbox: [41.2462, -72.9983, 41.3508, -72.8606] }, // New Haven
        { layer: 153, bbox: [41.3048, -72.8244, 41.4273, -72.7213] }, // North Branford
        { layer: 154, bbox: [41.3328, -72.9082, 41.4345, -72.8173] }, // North Haven
        { layer: 155, bbox: [41.2446, -73.087, 41.3148, -72.9799] }, // Orange
        { layer: 156, bbox: [41.3964, -72.887, 41.516, -72.7337] }, // Wallingford
        { layer: 157, bbox: [41.2327, -72.995, 41.3138, -72.9172] }, // West Haven
        { layer: 158, bbox: [41.3092, -73.0498, 41.3964, -72.9552] }, // Woodbridge
        { layer: 160, bbox: [41.335, -73.4356, 41.429, -73.3473] }, // Bethel
        { layer: 161, bbox: [41.4669, -73.4055, 41.5661, -73.3117] }, // Bridgewater
        { layer: 162, bbox: [41.4196, -73.4449, 41.5159, -73.3312] }, // Brookfield
        { layer: 163, bbox: [41.326, -73.5435, 41.4638, -73.4] }, // Danbury
        { layer: 164, bbox: [41.0357, -73.5187, 41.1149, -73.4445] }, // Darien
        { layer: 165, bbox: [40.9799, -73.7285, 41.1446, -73.554] }, // Greenwich
        { layer: 166, bbox: [41.1136, -73.556, 41.2122, -73.448] }, // New Canaan
        { layer: 167, bbox: [41.4404, -73.5379, 41.5348, -73.4263] }, // New Fairfield
        { layer: 168, bbox: [41.4914, -73.5071, 41.6834, -73.342] }, // New Milford
        { layer: 169, bbox: [41.3181, -73.3792, 41.4734, -73.1829] }, // Newtown
        { layer: 170, bbox: [41.0412, -73.4751, 41.1719, -73.3693] }, // Norwalk
        { layer: 171, bbox: [41.2541, -73.4695, 41.3499, -73.3047] }, // Redding
        { layer: 172, bbox: [41.2366, -73.5525, 41.3775, -73.438] }, // Ridgefield
        { layer: 173, bbox: [41.5202, -73.5332, 41.6671, -73.4507] }, // Sherman
        { layer: 174, bbox: [41.0161, -73.6343, 41.1803, -73.4968] }, // Stamford
        { layer: 175, bbox: [41.1744, -73.43, 41.2756, -73.323] }, // Weston
        { layer: 176, bbox: [41.0594, -73.3893, 41.1951, -73.2955] }, // Westport
        { layer: 177, bbox: [41.1532, -73.5024, 41.2655, -73.3787] } // Wilton
      ] },
    { id: 'de', label: 'Delaware (statewide)',
      service: 'https://enterprise.firstmap.delaware.gov/arcgis/rest/services/PlanningCadastre/DE_StateParcels/MapServer',
      lineLayer: 0, restyle: true, minZoom: 15,
      bbox: [38.45, -75.79, 39.84, -75.04], test: [39.1582, -75.5244] },
    /* ── Statewide, found and verified 2026-10-03 (two z17 tiles each, in
       different parts of the state). Idaho's IDWR layer is left out: its
       description says the data "cannot be shared outside IDWR". Hosted
       FeatureServers only (no /export to draw from): Indiana,
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
    'lacounty', 'orange', 'riverside', 'sacramento', 'harris', 'tarrant', 'travis', 'maricopa', 'pima', 'clark', 'franklin', 'oakland', 'allegheny', 'hennepin', 'jackson', 'stlouisco', 'marion', 'davidson', 'jefferson', 'saltlake', 'multnomah', 'hillsborough', 'miamidade', 'ct', 'pa', 'cook'];

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
    var ids = Array.isArray(layerId) ? layerId : [layerId];
    return JSON.stringify(ids.map(function (id) { return {
      id: id,
      source: { type: 'mapLayer', mapLayerId: id },
      drawingInfo: {
        showLabels: false,
        renderer: { type: 'simple', symbol: {
          type: 'esriSFS', style: 'esriSFSNull',
          outline: { type: 'esriSLS', style: 'esriSLSSolid', color: LINE_RGBA, width: LINE_WIDTH } } }
      }
    }; }));
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
    var layers = src.lineLayer;
    if (src.parts) {
      var tile = tileBox(x, y, z);
      layers = src.parts.filter(function (part) { return overlaps(part.bbox, tile); })
        .map(function (part) { return part.layer; });
      if (!layers.length) return null;
    }
    var bb = tileBbox(x, y, z);
    var which = src.restyle
      ? 'dynamicLayers=' + encodeURIComponent(lineStyle(layers))
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
      out[s.id] = { url: (s.lookup.service || s.service) + '/' + s.lookup.layer, idField: s.lookup.idField,
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
