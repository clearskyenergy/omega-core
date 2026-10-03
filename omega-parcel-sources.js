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
 * Where coverage goes next is scripts/_lib/parcel-priority.js (ACEEE's
 * scorecard, battery markets pulled up); `node scripts/parcel-coverage.js
 * --live` reports it state by state and names the next state.
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
     carries none), and the county name the answer reports.
     `lines: true` (with restyle) marks a layer of boundary LINES rather than
     parcel polygons (Kankakee's parcel fabric): it is drawn with a line
     symbol, because a fill symbol on a line layer is ignored.
     A layer that will not take dynamicLayers (restyle: false) is drawn in
     its county's own colours, and the editor repaints that picture in the
     one yellow on a canvas (every such server let this origin read it on
     2026-10-03; one that stops is shown as the county drew it).
     `browserOnly: true` marks a server that answers browsers and refuses
     every scripted client (Tennessee's): the map draws it, the checks ask
     it as a browser (scripts/_lib/parcel-draw.js), and it has no `lookup`,
     because the lookup runs on our server. */
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
    /* Added 2026-10-03, verified the same day. Champaign, Vermilion and Moline are
       county layers published by their largest city (Champaign's and Danville's
       layers are county-wide; Moline's is the city alone, the only public Rock
       Island parcels). Kankakee publishes a parcel fabric's boundary LINES, drawn
       with the line style (lines: true). Kendall's public layer is two townships. */
    { id: 'champaign', label: 'Champaign County, IL',
      service: 'https://gisportal.champaignil.gov/ms/rest/services/OpenGov/Open_Gov_Map_Service/MapServer',
      lineLayer: 0, restyle: true, minZoom: 15,
      bbox: [39.87, -88.47, 40.41, -87.92], test: [40.1167, -88.2441],
      lookup: { layer: 0, idField: 'PIN', owner: 'TaxPayer_Name', county: 'Champaign County' } },
    { id: 'kankakee', label: 'Kankakee County, IL',
      service: 'https://k3gis.com/arcgis/rest/services/Cadastral/Cadastral/MapServer',
      lineLayer: 20, restyle: true, lines: true, minZoom: 15,
      bbox: [40.99, -88.26, 41.31, -87.52], test: [41.1200, -87.8612] },
    { id: 'kendall', label: 'Kendall County, IL (Oswego and Bristol townships)',
      service: 'https://maps.co.kendall.il.us/server/rest/services/Hosted/OswegoERPMap/MapServer',
      lineLayer: 10, restyle: true, minZoom: 16,
      bbox: [41.63, -88.49, 41.73, -88.25], test: [41.6455, -88.4466],
      lookup: { layer: 10, idField: 'pin', owner: 'owner_name', county: 'Kendall County' } },
    { id: 'vermilion', label: 'Vermilion County, IL',
      service: 'https://gis.cityofdanville.org/arcgis/rest/services/Property/Property/MapServer',
      lineLayer: 0, restyle: true, minZoom: 15,
      bbox: [39.86, -87.95, 40.50, -87.52], test: [40.1250, -87.6296],
      lookup: { layer: 0, idField: 'PIN', owner: 'FullName', county: 'Vermilion County' } },
    { id: 'moline', label: 'City of Moline, IL',
      service: 'https://gis2.moline.il.us/arcgis/rest/services/Mobile_Map2/MapServer',
      lineLayer: 0, restyle: true, minZoom: 17,
      bbox: [41.42, -90.54, 41.52, -90.43], test: [41.5065, -90.5160],
      lookup: { layer: 0, idField: 'NEW_PIN', owner: 'NAME', county: 'Rock Island County' } },
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
    /* The 24 counties New York's statewide layer leaves out (its own list of
       participating counties), 16 of them covered here, verified 2026-10-03.
       Jefferson, Franklin and Clinton are one regional layer kept by the North
       Country's development authority (DANC), each county loaded at a different
       date; a tile touching two of their boxes asks for the picture once.
       Saratoga, Schenectady, Schoharie and Delaware are hosted by a consultant
       (VHB); Schenectady's service name carries a date, Saratoga's layer 57 is
       its "2026" layer, and both may move. Dutchess sends no CORS header (the
       lines draw; a map capture leaves them out). Monroe's drawn layer is the
       2021 roll. Still without a public layer: Columbia, Orleans, Herkimer,
       Allegany, Madison, Fulton, Seneca, Chenango. */
    { id: 'nassau', label: 'Nassau County, NY',
      service: 'https://gis.nassaucountyny.gov/server/rest/services/Layers/MapServer',
      lineLayer: 1, restyle: true, minZoom: 17,
      bbox: [40.58, -73.77, 40.92, -73.42], test: [40.7490, -73.6407],
      lookup: { layer: 1, idField: 'PARID', owner: null, county: 'Nassau County' } },
    { id: 'monroeny', label: 'Monroe County, NY',
      service: 'https://maps.monroecounty.gov/server/rest/services/Census_Data/Census_2020/MapServer',
      lineLayer: 5, restyle: true, minZoom: 15,
      bbox: [42.93, -78.01, 43.39, -77.36], test: [43.1580, -77.6100],
      lookup: { layer: 5, idField: 'PRINTKEY', owner: 'OWNERNAME1', county: 'Monroe County' } },
    { id: 'dutchess', label: 'Dutchess County, NY',
      service: 'https://gis.dutchessny.gov/server/rest/services/ParcelAccess_Public/MapServer',
      lineLayer: 3, restyle: true, minZoom: 15,
      bbox: [41.43, -74.00, 42.09, -73.48], test: [41.7036, -73.9287],
      lookup: { layer: 3, idField: 'PrintKey', owner: null, county: 'Dutchess County' } },
    { id: 'saratoga', label: 'Saratoga County, NY',
      service: 'https://spatialags.vhb.com/arcgis/rest/services/29820_Saratoga/NY_County_Saratoga/MapServer',
      lineLayer: 57, restyle: true, minZoom: 15,
      bbox: [42.77, -74.16, 43.40, -73.57], test: [43.0831, -73.7846],
      lookup: { layer: 57, idField: 'PRINT_KEY', owner: 'OWNER', county: 'Saratoga County' } },
    { id: 'schenectady', label: 'Schenectady County, NY',
      service: 'https://spatialags.vhb.com/arcgis/rest/services/29816_SIMS/SIMS_03262026/MapServer',
      lineLayer: 6, restyle: true, minZoom: 15,
      bbox: [42.71, -74.31, 42.96, -73.80], test: [42.8142, -73.9396],
      lookup: { layer: 6, idField: 'PRINT_KEY', owner: 'OWNER', county: 'Schenectady County' } },
    { id: 'niagara', label: 'Niagara County, NY',
      service: 'https://gis.niagaracounty.gov/server/rest/services/PublicViewer/Public_Viewer/MapServer',
      lineLayer: 4, restyle: true, minZoom: 15,
      bbox: [43.01, -79.08, 43.38, -78.46], test: [43.0964, -79.0375],
      lookup: { layer: 4, idField: 'PrintKey', owner: 'OwnrName', county: 'Niagara County' } },
    { id: 'jeffersonny', label: 'Jefferson County, NY',
      service: 'https://maps.dancgis.org/server/rest/services/Parcel_Model/MapServer',
      lineLayer: 0, restyle: true, minZoom: 15,
      bbox: [43.66, -76.45, 44.41, -75.44], test: [43.9752, -75.9108],
      lookup: { layer: 0, idField: 'PRINT_KEY', owner: 'PRIMARY_OW', county: 'Jefferson County' } },
    { id: 'chemung', label: 'Chemung County, NY',
      service: 'https://ccgcportal.chemungcountyny.gov/production/rest/services/viewers/Parcels/MapServer',
      lineLayer: 1, restyle: false, minZoom: 15,
      bbox: [42.00, -76.97, 42.30, -76.53], test: [42.0898, -76.8077],
      lookup: { layer: 1, idField: 'PrintKey', owner: 'Current_Owner', county: 'Chemung County' } },
    { id: 'clintonny', label: 'Clinton County, NY',
      service: 'https://maps.dancgis.org/server/rest/services/Parcel_Model/MapServer',
      lineLayer: 0, restyle: true, minZoom: 15,
      bbox: [44.41, -74.06, 45.03, -73.34], test: [44.6994, -73.4529],
      lookup: { layer: 0, idField: 'PRINT_KEY', owner: 'PRIMARY_OW', county: 'Clinton County' } },
    { id: 'cattaraugus', label: 'Cattaraugus County, NY',
      service: 'https://maps2.cattco.org/arcgiswebadaptor/rest/services/ParcelandSales_Viewer/MapServer',
      lineLayer: 3, restyle: true, minZoom: 15,
      bbox: [41.99, -79.07, 42.55, -78.30], test: [42.0778, -78.4303],
      lookup: { layer: 3, idField: 'TAX_MAP_NO', owner: 'OWNER1', county: 'Cattaraugus County' } },
    { id: 'washingtonny', label: 'Washington County, NY',
      service: 'https://gis.washingtoncountyny.gov/arcgis/rest/services/Layers/MapServer',
      lineLayer: 4, restyle: true, minZoom: 15,
      bbox: [42.94, -73.64, 43.81, -73.24], test: [43.3008, -73.5857],
      lookup: { layer: 4, idField: 'PRINT_KEY', owner: 'OWNER', county: 'Washington County' } },
    { id: 'delawareny', label: 'Delaware County, NY',
      service: 'https://spatialags.vhb.com/arcgis/rest/services/29822_Delaware/NY_County_Delaware/MapServer',
      lineLayer: 25, restyle: true, minZoom: 15,
      bbox: [41.84, -75.43, 42.52, -74.42], test: [42.2782, -74.9162],
      lookup: { layer: 25, idField: 'PRINT_KEY', owner: 'OWNER', county: 'Delaware County' } },
    { id: 'franklinny', label: 'Franklin County, NY',
      service: 'https://maps.dancgis.org/server/rest/services/Parcel_Model/MapServer',
      lineLayer: 0, restyle: true, minZoom: 15,
      bbox: [44.08, -74.76, 45.01, -73.88], test: [44.8486, -74.2949],
      lookup: { layer: 0, idField: 'PRINT_KEY', owner: 'PRIMARY_OW', county: 'Franklin County' } },
    { id: 'essexny', label: 'Essex County, NY',
      service: 'https://essex-gis.co.essex.ny.us/arcgis/rest/services/NY_County_Essex/MapServer',
      lineLayer: 7, restyle: true, minZoom: 15,
      bbox: [43.72, -74.35, 44.57, -73.30], test: [44.2795, -73.9799],
      lookup: { layer: 7, idField: 'PRINTKEY', owner: 'OWNER', county: 'Essex County' } },
    { id: 'schoharie', label: 'Schoharie County, NY',
      service: 'https://spatialags.vhb.com/arcgis/rest/services/20327_Schoharie/NY_County_Schoharie/MapServer',
      lineLayer: 5, restyle: true, minZoom: 15,
      bbox: [42.35, -74.72, 42.83, -74.16], test: [42.6776, -74.4854],
      lookup: { layer: 5, idField: 'PRINT_KEY', owner: 'OWNER', county: 'Schoharie County' } },
    { id: 'yates', label: 'Yates County, NY',
      service: 'https://gisportal.yatescounty.org/server/rest/services/PY_Village_Bound_Nov2025/MapServer',
      lineLayer: 0, restyle: true, minZoom: 15,
      bbox: [42.45, -77.37, 42.77, -76.90], test: [42.6609, -77.0533],
      lookup: { layer: 0, idField: 'PRINT_KEY', owner: 'OWNER', county: 'Yates County' } },
    { id: 'de', label: 'Delaware (statewide)',
      service: 'https://enterprise.firstmap.delaware.gov/arcgis/rest/services/PlanningCadastre/DE_StateParcels/MapServer',
      lineLayer: 0, restyle: true, minZoom: 15,
      bbox: [38.45, -75.79, 39.84, -75.04], test: [39.1582, -75.5244] },
    /* District of Columbia (DC GIS, CC BY 4.0), Connecticut and Puerto Rico,
       verified 2026-10-03. Connecticut's service is 169 town layers in 9
       regional groups, too many for one restyle, so it is drawn in its own
       thin grey and repainted yellow in the editor; its one statewide layer is
       a FeatureServer, so there is no point lookup. Puerto Rico is CRIM's
       parcels on the Planning Board's server (the service name carries a date);
       roads and water are polygons in it too. */
    { id: 'dc', label: 'District of Columbia',
      service: 'https://maps2.dcgis.dc.gov/dcgis/rest/services/DCGIS_DATA/Property_and_Land_WebMercator/MapServer',
      lineLayer: 40, restyle: true, minZoom: 16,
      bbox: [38.79, -77.12, 39.00, -76.90], test: [38.9035, -77.0328],
      lookup: { layer: 40, idField: 'SSL', owner: 'OWNERNAME', county: 'District of Columbia' } },
    { id: 'ct', label: 'Connecticut (statewide)',
      service: 'https://cteco.uconn.edu/ctmaps/rest/services/Parcels/Parcels_tiled/MapServer',
      lineLayer: '0,39,46,63,85,105,123,143,159', restyle: false, minZoom: 14,
      bbox: [40.97, -73.73, 42.06, -71.78], test: [41.7658, -72.6734] },
    { id: 'pr', label: 'Puerto Rico (statewide)',
      service: 'https://sigejp.pr.gov/server/rest/services/crim/crim_feb_2025/MapServer',
      lineLayer: 0, restyle: true, minZoom: 14,
      bbox: [17.87, -67.96, 18.53, -65.21], test: [18.4655, -66.1057],
      lookup: { layer: 0, idField: 'NUM_CATASTRO', owner: null, county: 'Puerto Rico' } },
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
    /* Colorado's statewide layer holds 44 of 64 counties (checked 2026-10-03).
       Fremont fills one gap; Montrose's terms ask for permission first; Delta and
       Chaffee are FeatureServers only. Fremont's layer id is what its server
       calls it. */
    { id: 'fremontco', label: 'Fremont County, CO',
      service: 'https://fremontgis.com/server/rest/services/AUT_LAND_RECORDS/MapServer',
      lineLayer: 1082516613, restyle: true, minZoom: 15,
      bbox: [38.25, -106.02, 38.70, -104.93], test: [38.4411, -105.2425],
      lookup: { layer: 1082516613, idField: 'ASSR_MAPNO', owner: 'OWNER_NAME', county: 'Fremont County' } },
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
    /* Arizona, verified 2026-10-03. Yavapai and Coconino come from the Arizona
       Department of Water Resources' statewide service (one layer per county,
       alphabetical: 0 Apache … 13 Yavapai, 14 Yuma) because both counties' own
       servers refuse scripted and image requests; any other Arizona county is
       the same service at its own layer id. */
    { id: 'pinal', label: 'Pinal County, AZ',
      service: 'https://gis.pinal.gov/mapping/rest/services/TaxParcels/MapServer',
      lineLayer: 3, restyle: true, minZoom: 15,
      bbox: [32.49, -112.21, 33.47, -110.43], test: [32.8773, -111.7568],
      lookup: { layer: 3, idField: 'PARCELID', owner: 'OWNERNME1', county: 'Pinal County' } },
    { id: 'yavapai', label: 'Yavapai County, AZ',
      service: 'https://azwatermaps.azwater.gov/arcgis/rest/services/General/Parcels/MapServer',
      lineLayer: 13, restyle: true, minZoom: 15,
      bbox: [33.86, -113.38, 35.56, -111.45], test: [34.5391, -112.4677],
      lookup: { layer: 13, idField: 'APN', owner: 'OWNER_NAME', county: 'Yavapai County' } },
    { id: 'coconino', label: 'Coconino County, AZ',
      service: 'https://azwatermaps.azwater.gov/arcgis/rest/services/General/Parcels/MapServer',
      lineLayer: 2, restyle: true, minZoom: 15,
      bbox: [34.29, -113.35, 37.02, -110.74], test: [35.1988, -111.6503],
      lookup: { layer: 2, idField: 'APN', owner: 'OWNER_NAME', county: 'Coconino County' } },
    { id: 'mohave', label: 'Mohave County, AZ',
      service: 'https://mcgis.mohave.gov/arcgis/rest/services/PARCELS/MapServer',
      lineLayer: 3, restyle: true, minZoom: 15,
      bbox: [34.20, -114.75, 37.01, -112.52], test: [35.1891, -114.0544],
      lookup: { layer: 3, idField: 'TAXPIN', owner: 'OWNER', county: 'Mohave County' } },
    { id: 'yuma', label: 'Yuma County, AZ',
      service: 'https://arcgis.yumacountyaz.gov/webgis/rest/services/YC_Parcels/MapServer',
      lineLayer: 0, restyle: true, minZoom: 15,
      bbox: [32.03, -114.83, 33.47, -113.32], test: [32.7244, -114.6250],
      lookup: { layer: 0, idField: 'PIDNUM', owner: 'OWNER_NAME', county: 'Yuma County' } },
    /* New Mexico, verified 2026-10-03: the county assessors' own services, and
       for Sandoval the State Engineer's 2023 county-parcels service (one layer
       per county, alphabetical; its 2025 service draws blank tiles). */
    { id: 'bernalillo', label: 'Bernalillo County, NM',
      service: 'https://assessormap.bernco.gov/server/rest/services/GIS/Assessor_Parcels_Public/MapServer',
      lineLayer: 0, restyle: true, minZoom: 16,
      bbox: [34.86, -107.20, 35.23, -106.14], test: [35.0842, -106.6514],
      lookup: { layer: 0, idField: 'UPC', owner: 'OWNER', county: 'Bernalillo County' } },
    { id: 'santafe', label: 'Santa Fe County, NM',
      service: 'https://sfcomaps.santafecountynm.gov/restsvc/rest/services/LAND/Parcels/MapServer',
      lineLayer: 0, restyle: true, minZoom: 15,
      bbox: [35.03, -106.26, 36.01, -105.70], test: [35.6870, -105.9378],
      lookup: { layer: 0, idField: 'UPC', owner: 'OwnerName', county: 'Santa Fe County' } },
    { id: 'donaana', label: 'Doña Ana County, NM',
      service: 'https://gis.donaana.gov/server/rest/services/Parcels/MapServer',
      lineLayer: 0, restyle: true, minZoom: 15,
      bbox: [31.77, -107.32, 33.06, -106.33], test: [32.3159, -106.7744],
      lookup: { layer: 0, idField: 'PARCELNUMBER', owner: 'OWNERNAME', county: 'Doña Ana County' } },
    { id: 'sandoval', label: 'Sandoval County, NM',
      service: 'https://gis.ose.nm.gov/server_s/rest/services/Support_Features/County_Parcels_2023/MapServer',
      lineLayer: 23, restyle: true, minZoom: 15,
      bbox: [35.18, -107.64, 36.25, -106.23], test: [35.2344, -106.6784],
      lookup: { layer: 23, idField: 'UPC', owner: null, county: 'Sandoval County' } },
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
    /* Michigan (no statewide parcel layer). Wayne's layer holds Detroit.
       Washtenaw, Ingham, Genesee and Kalamazoo publish parcels only behind a
       token or as hosted FeatureServers (no picture to draw). Added 2026-10-03. */
    { id: 'wayne', label: 'Wayne County, MI',
      service: 'https://www.waynecounty.com/gisserver/rest/services/ParcelViewer/prcls_fullAdd_parsed_FINAL/MapServer',
      lineLayer: 0, restyle: true, minZoom: 15,
      bbox: [42.03, -83.56, 42.46, -82.86], test: [42.3360, -83.0490],
      lookup: { layer: 0, idField: 'packedParc', owner: 'ownername1', county: 'Wayne County' } },
    { id: 'kent', label: 'Kent County, MI',
      service: 'https://gis.kentcountymi.gov/agisprod/rest/services/OpenData/Parcel_Related_Layers/MapServer',
      lineLayer: 0, restyle: true, minZoom: 15,
      bbox: [42.76, -85.80, 43.30, -85.30], test: [42.9634, -85.6681],
      lookup: { layer: 0, idField: 'PNUM', owner: null, county: 'Kent County' } },
    { id: 'macomb', label: 'Macomb County, MI',
      service: 'https://gis.macombgov.org/arcgis1/rest/services/PARCEL_FABRIC/Parcels_Web/MapServer',
      lineLayer: 0, restyle: true, minZoom: 15,
      bbox: [42.44, -83.12, 42.91, -82.70], test: [42.5803, -82.9196],
      lookup: { layer: 0, idField: 'TAX_ID', owner: 'ownername1', county: 'Macomb County' } },
    { id: 'ottawa', label: 'Ottawa County, MI',
      service: 'https://gis.miottawa.org/arcgis/rest/services/HostedServices/ParcelsPublic/MapServer',
      lineLayer: 0, restyle: true, minZoom: 14,
      bbox: [42.72, -86.28, 43.21, -85.77], test: [42.7905, -86.1050],
      lookup: { layer: 0, idField: 'FinalPIN', owner: 'OwnerName', county: 'Ottawa County' } },
    { id: 'muskegon', label: 'Muskegon County, MI',
      service: 'https://maps.muskegoncountygis.com/arcgis/rest/services/Layers/Parcels_Base/MapServer',
      lineLayer: 30, restyle: true, minZoom: 17,
      bbox: [43.11, -86.47, 43.48, -85.79], test: [43.2330, -86.2500],
      lookup: { layer: 30, idField: 'PIN', owner: 'Owner_Name1', county: 'Muskegon County' } },
    { id: 'jacksonmi', label: 'Jackson County, MI',
      service: 'https://gis.mijackson.org/countygis/rest/services/RealEstate/RealEstateParcels/MapServer',
      lineLayer: 0, restyle: true, minZoom: 16,
      bbox: [42.07, -84.72, 42.43, -84.13], test: [42.2459, -84.4013],
      lookup: { layer: 0, idField: 'PIN', owner: 'OWNER', county: 'Jackson County' } },
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
    /* Minnesota's statewide layer holds 59 of 87 counties (checked 2026-10-03);
       three of the missing ones, verified the same day. Freeborn and Nicollet
       are FeatureServers only. */
    { id: 'blueearth', label: 'Blue Earth County, MN',
      service: 'https://gis.blueearthcountymn.gov/server/rest/services/LandRecords/TaxParcels/MapServer',
      lineLayer: 0, restyle: true, minZoom: 14,
      bbox: [43.84, -94.38, 44.27, -93.76], test: [44.1638, -93.9993],
      lookup: { layer: 0, idField: 'ParcelNo', owner: null, county: 'Blue Earth County' } },
    { id: 'kandiyohi', label: 'Kandiyohi County, MN',
      service: 'https://gis.kcmn.us/arcgis/rest/services/Kandiyohi/Boundaries/MapServer',
      lineLayer: 1, restyle: true, minZoom: 15,
      bbox: [44.89, -95.26, 45.42, -94.75], test: [45.1219, -95.0433],
      lookup: { layer: 1, idField: 'PIN', owner: 'TAXNAME', county: 'Kandiyohi County' } },
    { id: 'beltrami', label: 'Beltrami County, MN',
      service: 'https://arcgis.co.beltrami.mn.us/arcgis/rest/services/BeltramiData/BeltramiOpenData/MapServer',
      lineLayer: 2, restyle: true, minZoom: 15,
      bbox: [47.40, -95.61, 48.55, -94.40], test: [47.4739, -94.8801],
      lookup: { layer: 2, idField: 'PIN', owner: 'OWNERNAME1', county: 'Beltrami County' } },
    { id: 'jackson', label: 'Jackson County, MO',
      service: 'https://jcgis.jacksongov.org/arcgis/rest/services/ParcelViewer/ParcelsAscendRelate/MapServer',
      lineLayer: 1, restyle: true, minZoom: 15,
      bbox: [38.83, -94.61, 39.24, -94.10], test: [39.0997, -94.5786],
      lookup: { layer: 1, idField: 'Name', owner: null, county: 'Jackson County' } },
    /* Kansas, verified 2026-10-03. Johnson County (AIMS) sells its parcel
       services to data partners, so it is not here; Overland Park's own layer is
       AIMS's data and awaits that decision too. */
    { id: 'wyandotte', label: 'Wyandotte County, KS',
      service: 'https://gisweb.wycokck.org/arcgis/rest/services/GISPUB/Parcel_Polygons/MapServer',
      lineLayer: 0, restyle: true, minZoom: 15,
      bbox: [38.98, -94.92, 39.21, -94.59], test: [39.1140, -94.6277],
      lookup: { layer: 0, idField: 'PARCEL', owner: null, county: 'Wyandotte County' } },
    { id: 'sedgwickks', label: 'Sedgwick County, KS',
      service: 'https://gismaps.sedgwickcounty.org/arcgis/rest/services/Map/Op_Parcel_Dynamic_SP/MapServer',
      lineLayer: 0, restyle: false, minZoom: 15,
      bbox: [37.46, -97.82, 37.92, -97.14], test: [37.6870, -97.3307],
      lookup: { layer: 0, idField: 'PIN', owner: null, county: 'Sedgwick County' } },
    { id: 'shawneeks', label: 'Shawnee County, KS',
      service: 'https://gis.sncoapps.us/arcgis2/rest/services/Current_Parcels/MapServer',
      lineLayer: 4, restyle: true, minZoom: 15,
      bbox: [38.86, -96.05, 39.23, -95.48], test: [39.0473, -95.6756],
      lookup: { layer: 4, idField: 'PID', owner: 'ONAME', county: 'Shawnee County' } },
    { id: 'stlouisco', label: 'St. Louis County, MO',
      service: 'https://maps.stlouisco.com/hosting/rest/services/Maps/AGS_Parcels/MapServer',
      lineLayer: 0, restyle: true, minZoom: 15,
      bbox: [38.39, -90.75, 38.90, -90.12], test: [38.6426, -90.3237],
      lookup: { layer: 0, idField: 'LOCATOR', owner: 'OWNER_NAME', county: 'St. Louis County' } },
    /* Missouri, verified 2026-10-03. Greene's layer is county-wide on the City of
       Springfield's server. St. Charles sits behind a bot challenge; Clay and
       Platte publish no public MapServer. */
    { id: 'stlcity', label: 'City of St. Louis, MO',
      service: 'https://maps8.stlouis-mo.gov/arcgis/rest/services/ASSESSOR/Assessor_Public_Parcels/MapServer',
      lineLayer: 11, restyle: true, minZoom: 15,
      bbox: [38.53, -90.33, 38.78, -90.17], test: [38.6267, -90.1997],
      lookup: { layer: 11, idField: 'ParcelId', owner: 'OwnerName', county: 'City of St. Louis' } },
    { id: 'greenemo', label: 'Greene County, MO',
      service: 'https://maps.springfieldmo.gov/arcgis/rest/services/Maps/GisViewer/MapServer',
      lineLayer: 66, restyle: true, minZoom: 16,
      bbox: [37.08, -93.63, 37.43, -93.06], test: [37.2081, -93.2925],
      lookup: { layer: 66, idField: 'PIN', owner: 'OWN1', county: 'Greene County' } },
    { id: 'boonemo', label: 'Boone County, MO',
      service: 'https://gis.boonemo.gov/arcgis/rest/services/BC_Basemap_MSD_V2/MapServer',
      lineLayer: 7, restyle: true, minZoom: 15,
      bbox: [38.64, -92.58, 39.25, -92.10], test: [38.9519, -92.3343],
      lookup: { layer: 7, idField: 'ASSESSOR', owner: null, county: 'Boone County' } },
    { id: 'marion', label: 'Marion County, IN',
      service: 'https://gis.indy.gov/server/rest/services/MapIndy/MapIndyProperty/MapServer',
      lineLayer: 10, restyle: true, minZoom: 16,
      bbox: [39.63, -86.33, 39.93, -85.93], test: [39.7684, -86.1581],
      lookup: { layer: 10, idField: 'STATEPARCELNUMBER', owner: null, county: 'Marion County' } },
    /* Indiana, verified 2026-10-03. Indiana's statewide parcels are hosted
       FeatureServers only, so the counties: Allen (Fort Wayne; its lookup fields
       are the service's joined names, as it returns them) and Vanderburgh
       (Evansville). */
    { id: 'allen', label: 'Allen County, IN',
      service: 'https://gis.acimap.us/services/rest/services/CFW/Parcels_With_Ownership_Information/MapServer',
      lineLayer: 0, restyle: true, minZoom: 15,
      bbox: [40.91, -85.34, 41.28, -84.79], test: [41.0796, -85.1401],
      lookup: { layer: 0, idField: 'GISPublished.SDE.Parcel_Poly.PIN', owner: 'sde.CurrentOwner.OwnerofRecord', county: 'Allen County' } },
    { id: 'vanderburgh', label: 'Vanderburgh County, IN',
      service: 'https://maps.evansvillegis.com/arcgis_server/rest/services/ASSESSOR/PARCEL_DATA/MapServer',
      lineLayer: 0, restyle: false, minZoom: 16,
      bbox: [37.82, -87.71, 38.17, -87.44], test: [37.9705, -87.5714],
      lookup: { layer: 0, idField: 'NAME', owner: 'OWNER1', county: 'Vanderburgh County' } },
    { id: 'davidson', label: 'Davidson County, TN',
      service: 'https://maps.nashville.gov/arcgis/rest/services/Cadastral/Parcels/MapServer',
      lineLayer: 0, restyle: true, minZoom: 16,
      bbox: [35.96, -87.06, 36.41, -86.51], test: [36.16, -86.78],
      lookup: { layer: 0, idField: 'APN', owner: 'Owner', county: 'Davidson County' } },
    /* Tennessee, verified 2026-10-03. The state's layer (TDEC, 94 of 95 counties;
       not Knox) answers browsers only: every scripted client gets a 403, so it is
       browserOnly (scripts/_lib/parcel-draw.js asks it as a browser) and carries
       no point lookup, which runs on the server. It overlaps Davidson's and
       Hamilton's own layers. Knox (KGIS) refuses everything; Shelby is covered by
       the state layer alone. */
    { id: 'tn', label: 'Tennessee (statewide except Knox)',
      service: 'https://tdeconline.tn.gov/arcgis/rest/services/Parcels_OG/MapServer',
      lineLayer: 0, restyle: true, browserOnly: true, minZoom: 14,
      bbox: [34.90, -90.40, 36.70, -81.64], test: [35.1486, -90.0475] },
    { id: 'hamiltontn', label: 'Hamilton County, TN',
      service: 'https://gis.hamiltontn.gov/server/rest/services/Parcels/MapServer',
      lineLayer: 0, restyle: true, minZoom: 15,
      bbox: [34.97, -85.48, 35.47, -84.94], test: [35.0453, -85.3100],
      lookup: { layer: 0, idField: 'GISLINK', owner: 'OWNERNAME1', county: 'Hamilton County' } },
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
    /* Utah, verified 2026-10-03. Utah's statewide parcels (UGRC) are published
       only as FeatureServers, so the counties' own services. Davis's and Utah
       County's public layers carry no owner names. */
    { id: 'utahco', label: 'Utah County, UT',
      service: 'https://maps.utahcounty.gov/arcgis/rest/services/Assessor/Assr_Parcels/MapServer',
      lineLayer: 0, restyle: true, minZoom: 14,
      bbox: [39.77, -112.22, 40.58, -110.85], test: [40.2340, -111.6578],
      lookup: { layer: 0, idField: 'PARCELID', owner: null, county: 'Utah County' } },
    { id: 'davis', label: 'Davis County, UT',
      service: 'https://gisportal-pro.daviscountyutah.gov/server/rest/services/Public/Davis_County_Public_Parcels/MapServer',
      lineLayer: 0, restyle: true, minZoom: 16,
      bbox: [40.81, -112.18, 41.16, -111.77], test: [41.0607, -111.9701],
      lookup: { layer: 0, idField: 'ParcelTaxID', owner: null, county: 'Davis County' } },
    { id: 'weber', label: 'Weber County, UT',
      service: 'https://maps.webercountyutah.gov/arcgis/rest/services/gis/parcels_geogizmo2/MapServer',
      lineLayer: 0, restyle: true, minZoom: 15,
      bbox: [41.07, -112.50, 41.44, -111.42], test: [41.2239, -111.9727],
      lookup: { layer: 0, idField: 'PARCEL_ID', owner: 'NAME_ONE', county: 'Weber County' } },
    { id: 'washingtonut', label: 'Washington County, UT',
      service: 'https://agisprodvm.washco.utah.gov/arcgis/rest/services/Parcels/MapServer',
      lineLayer: 0, restyle: false, minZoom: 16,
      bbox: [36.98, -114.08, 37.63, -112.89], test: [37.1041, -113.5858],
      lookup: { layer: 0, idField: 'TAX_ID', owner: null, county: 'Washington County' } },
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
      lookup: { layer: 26, idField: 'FOLIO', owner: 'TRUE_OWNER1', county: 'Miami-Dade County' } },
    /* Georgia, verified 2026-10-03: metro Atlanta and Savannah. Not here:
       Gwinnett (its only public parcel layer prints a PIN and a house number on
       every lot, in its own style), Forsyth (its terms forbid any sale of the map
       or its information without written permission; awaiting that decision). */
    { id: 'fulton', label: 'Fulton County, GA',
      service: 'https://gismaps.fultoncountyga.gov/arcgispub/rest/services/OpenData/Tax_Parcels/MapServer',
      lineLayer: 0, restyle: true, minZoom: 15,
      bbox: [33.50, -84.86, 34.19, -84.09], test: [33.7490, -84.3880],
      lookup: { layer: 0, idField: 'ParcelID', owner: 'Owner', county: 'Fulton County' } },
    { id: 'dekalbga', label: 'DeKalb County, GA',
      service: 'https://dcgis.dekalbcountyga.gov/mapping/rest/services/TaxParcels/MapServer',
      lineLayer: 0, restyle: true, minZoom: 16,
      bbox: [33.61, -84.36, 33.98, -84.02], test: [33.7751, -84.2965],
      lookup: { layer: 0, idField: 'PARCELID', owner: 'OWNERNME1', county: 'DeKalb County' } },
    { id: 'cobb', label: 'Cobb County, GA',
      service: 'https://gis.cobbcounty.gov/gisserver/rest/services/cobbpublic/Parcels/MapServer',
      lineLayer: 3, restyle: true, minZoom: 16,
      bbox: [33.74, -84.75, 34.09, -84.37], test: [33.9525, -84.5504],
      lookup: { layer: 3, idField: 'PIN', owner: 'OWNER_NAM1', county: 'Cobb County' } },
    { id: 'chathamga', label: 'Chatham County, GA',
      service: 'https://pub.sagis.org/arcgis/rest/services/ChathamCounty/Parcels_Cyclomedia/MapServer',
      lineLayer: 0, restyle: true, minZoom: 15,
      bbox: [31.72, -81.40, 32.24, -80.83], test: [32.0812, -81.0911],
      lookup: { layer: 0, idField: 'PIN', owner: 'Owner', county: 'Chatham County' } },
    /* South Carolina, verified 2026-10-03. Greenville is the CITY's layer (the
       county publishes no public service); Richland publishes a GeoServer WMS,
       not an ArcGIS MapServer. */
    { id: 'charleston', label: 'Charleston County, SC',
      service: 'https://gisccapps.charlestoncounty.org/arcgis/rest/services/GIS_VIEWER/External_GIS_Website/MapServer',
      lineLayer: 7, restyle: true, minZoom: 15,
      bbox: [32.48, -80.46, 33.23, -79.26], test: [32.7767, -79.9305],
      lookup: { layer: 7, idField: 'PID', owner: 'OWNER1', county: 'Charleston County' } },
    { id: 'berkeleysc', label: 'Berkeley County, SC',
      service: 'https://gis.berkeleycountysc.gov/arcgis/rest/services/internet/MapServer',
      lineLayer: 4, restyle: true, minZoom: 15,
      bbox: [32.81, -80.37, 33.51, -79.44], test: [33.1958, -80.0136],
      lookup: { layer: 4, idField: 'O_TMS', owner: 'OwnerName', county: 'Berkeley County' } },
    { id: 'horry', label: 'Horry County, SC',
      service: 'https://gisportal.horrycounty.org/server/rest/services/OpenData/Parcels/MapServer',
      lineLayer: 0, restyle: true, minZoom: 15,
      bbox: [33.56, -79.35, 34.31, -78.52], test: [33.6893, -78.8866],
      lookup: { layer: 0, idField: 'PIN', owner: null, county: 'Horry County' } },
    { id: 'lexingtonsc', label: 'Lexington County, SC',
      service: 'https://maps.lex-co.com/agstserver/rest/services/Property/MapServer',
      lineLayer: 4, restyle: true, minZoom: 14,
      bbox: [33.65, -81.58, 34.20, -80.92], test: [33.9816, -81.2360],
      lookup: { layer: 4, idField: 'TMS', owner: 'Owner', county: 'Lexington County' } },
    { id: 'spartanburg', label: 'Spartanburg County, SC',
      service: 'https://maps.spartanburgcounty.org/server/rest/services/OneMap/Tax_Parcels/MapServer',
      lineLayer: 1, restyle: true, minZoom: 15,
      bbox: [34.57, -82.24, 35.21, -81.71], test: [34.9492, -81.9319],
      lookup: { layer: 1, idField: 'MAPNUMBER', owner: 'OwnerName', county: 'Spartanburg County' } },
    { id: 'greenvillesc', label: 'City of Greenville, SC',
      service: 'https://citygis.greenvillesc.gov/arcgis/rest/services/GeneralData/GeneralData_6570/MapServer',
      lineLayer: 2, restyle: true, minZoom: 15,
      bbox: [34.73, -82.48, 34.93, -82.24], test: [34.8530, -82.3937],
      lookup: { layer: 2, idField: 'PIN', owner: 'OWNAM1', county: 'Greenville County' } },
    { id: 'claytonga', label: 'Clayton County, GA',
      service: 'https://gis.claytoncountyga.gov/server/rest/services/TaxAssessor/TylerTaxParcels/MapServer',
      lineLayer: 0, restyle: true, minZoom: 15,
      bbox: [33.35, -84.46, 33.65, -84.24], test: [33.5217, -84.3538],
      lookup: { layer: 0, idField: 'PARCELID', owner: 'OWNERNME', county: 'Clayton County' } },
    { id: 'cherokeega', label: 'Cherokee County, GA',
      service: 'https://gis.cherokeecountyga.gov/arcgis/rest/services/MainLayersOnline/MapServer',
      lineLayer: 1, restyle: true, minZoom: 15,
      bbox: [34.07, -84.67, 34.42, -84.25], test: [34.2366, -84.4907],
      lookup: { layer: 1, idField: 'PIN', owner: 'OWNER', county: 'Cherokee County' } },
    { id: 'henryga', label: 'Henry County, GA',
      service: 'https://arcgis.co.henry.ga.us/server/rest/services/Parcels/MapServer',
      lineLayer: 12, restyle: true, minZoom: 16,
      bbox: [33.29, -84.36, 33.65, -83.92], test: [33.4473, -84.1468],
      lookup: { layer: 12, idField: 'PARCEL_NO', owner: null, county: 'Henry County' } }
  ];

  /* The server asks these for the parcel under a point, in this order:
     tightest box first, Cook last (its box holds DuPage's). */
  var LOOKUP_ORDER = ['dupage', 'lake', 'peoria', 'kane', 'sangamon', 'mclean', 'stclair', 'macon', 'tazewell', 'grundy', 'lasalle', 'madison', 'adams', 'coles', 'knox', 'lee', 'boone', 'winnebago',
    'lacounty', 'orange', 'riverside', 'sacramento', 'harris', 'tarrant', 'travis', 'maricopa', 'pima', 'clark', 'franklin', 'oakland', 'allegheny', 'hennepin', 'jackson', 'stlouisco', 'marion', 'davidson', 'jefferson', 'saltlake', 'multnomah', 'hillsborough', 'miamidade', 'champaign', 'kendall', 'vermilion', 'moline', 'wayne', 'kent', 'macomb', 'ottawa', 'muskegon', 'jacksonmi', 'nassau', 'monroeny', 'dutchess', 'saratoga', 'schenectady', 'niagara', 'jeffersonny', 'chemung', 'clintonny', 'cattaraugus', 'washingtonny', 'delawareny', 'franklinny', 'essexny', 'schoharie', 'yates', 'dc', 'pr', 'pinal', 'yavapai', 'coconino', 'mohave', 'yuma', 'bernalillo', 'santafe', 'donaana', 'sandoval', 'utahco', 'davis', 'weber', 'washingtonut', 'hamiltontn', 'allen', 'vanderburgh', 'fulton', 'dekalbga', 'cobb', 'chathamga', 'claytonga', 'cherokeega', 'henryga', 'stlcity', 'greenemo', 'boonemo', 'wyandotte', 'sedgwickks', 'shawneeks', 'charleston', 'berkeleysc', 'horry', 'lexingtonsc', 'spartanburg', 'greenvillesc', 'fremontco', 'blueearth', 'kandiyohi', 'beltrami', 'pa', 'cook'];

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

  /* dynamicLayers: the source's own layer, labels off, in the one line
     style: a polygon layer as an outline with no fill, a line layer
     (`lines: true`, a parcel fabric's boundaries such as Kankakee's) as the
     line itself, because a fill symbol on a line layer is ignored and the
     county's own colour comes back. */
  function lineStyle(layerId, lines) {
    var line = { type: 'esriSLS', style: 'esriSLSSolid', color: LINE_RGBA, width: LINE_WIDTH };
    return JSON.stringify([{
      id: layerId,
      source: { type: 'mapLayer', mapLayerId: layerId },
      drawingInfo: {
        showLabels: false,
        renderer: { type: 'simple', symbol: lines ? line : { type: 'esriSFS', style: 'esriSFSNull', outline: line } }
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
      ? 'dynamicLayers=' + encodeURIComponent(lineStyle(src.lineLayer, src.lines))
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
