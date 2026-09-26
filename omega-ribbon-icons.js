/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * The editor ribbon's icon set: one 24×24 stroke glyph per button, keyed by
 * the button's label, in the line style of the light ribbon (1.7 stroke,
 * round caps). editor.html's OmegaRibbonIcons module draws these in place of
 * the text glyphs; scripts/tests/tribbonicons.js asserts that every ribbon
 * label in editor.html resolves here, so a button never shows the generic
 * placeholder again ("we had logos for this earlier", Tommy, 2026-09-26).
 *
 * Drawn for the people who use the tool — architects, engineers, estimators:
 * a parcel is a surveyed polygon with its corners, an exclusion is hatched,
 * a service point is a drop with a meter, a substation is a fenced yard with
 * its bus, a transformer is two coils, a load screen is a gauge.
 *
 * ES5, no dependencies; UMD so the test can require it. Paths only: no
 * <circle>, so one <path d> element is the whole icon (a dot is "h.01"). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.OmegaRibbonIconSet = factory();
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';
  var FALLBACK = 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z';
  /* the label as the button prints it, reduced to letters and digits */
  function key(text) { return String(text == null ? '' : text).toLowerCase().replace(/[^a-z0-9]+/g, ''); }

  /* shared shapes */
  var MAP = 'M2 6l6-3 8 3 6-3v15l-6 3-8-3-6 3zM8 3v15M16 6v15';
  var DOC = 'M6 3h9l5 5v13H6zM15 3v5h5';
  var CUBE = 'M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 12l8-4.5M12 12v9M12 12L4 7.5';
  var LAYERS = 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5M3 17l9 5 9-5';
  var BATTERY = 'M4 7h13v10H4zM17 10h3v4h-3M7 10v4M10 10v4M13 10v4';
  var CHARGER = 'M6 21V4h10v17M4 21h14M9 8h4v4H9zM16 8h2a2 2 0 0 1 2 2v6a1.5 1.5 0 0 0 3 0V11';
  var SOLAR = 'M3 18l3-12h12l3 12zM9 6l-1 12M15 6l1 12M5 12h14M9 21h6';
  var GAUGE = 'M4 16a8 8 0 0 1 16 0M12 16l4-5M4 20h16';
  var RULER = 'M3 17L17 3l4 4L7 21zM7 13l2 2M10 10l2 2M13 7l2 2';
  var GEAR = 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1';
  var BUILDING = 'M4 21V6l8-3 8 3v15zM9 9h2M13 9h2M9 13h2M13 13h2M10 21v-4h4v4M2 21h20';
  var TRANSFORMER = 'M3 12h3M18 12h3M7 7c2.5 0 2.5 2.5 0 2.5s-2.5 2.5 0 2.5-2.5 2.5 0 2.5-2.5 2.5 0 2.5M17 7c-2.5 0-2.5 2.5 0 2.5s2.5 2.5 0 2.5 2.5 2.5 0 2.5 2.5 2.5 0 2.5M11 6v12M13 6v12';
  var EXPORT = 'M12 3v12M8 7l4-4 4 4M4 15v5h16v-5';
  var TABLE = 'M4 5h16v14H4zM4 10h16M4 15h16M10 5v14';
  var FENCE = 'M4 21V9l2-2 2 2v12M10 21V9l2-2 2 2v12M16 21V9l2-2 2 2v12M3 13h18M3 18h18';
  var SERVICE = 'M12 3v5M8 8h8M9 8v5a3 3 0 0 0 6 0V8M12 16v5M9 21h6';
  var CHECKMAP = MAP + 'M9 12l2 2 4-4';
  var PLUG = 'M9 3v5M15 3v5M7 8h10v3a5 5 0 0 1-10 0zM12 16v5';
  var LINK = 'M10 8H7a4 4 0 0 0 0 8h3M14 8h3a4 4 0 0 1 0 8h-3M9 12h6';
  var POLYGON = 'M5 8l7-4 7 3-1 9-6 4-6-4zM5 8h.01M12 4h.01M19 7h.01M18 16h.01M12 20h.01M6 16h.01';
  var SERVER = 'M4 4h16v6H4zM4 14h16v6H4zM7 7h.01M7 17h.01M11 7h6M11 17h6';

  var ICONS = {
    /* ── 1 · Site: prepare the parcel ── */
    sitesetup: MAP,
    traceboundary: POLYGON,
    addexclusion: 'M4 5h16v14H4zM4 11l6-6M4 17L16 5M10 19L20 9M16 19l4-4',
    interconservicept: SERVICE, interconsubstation: 'M3 6h18M3 9h18M8 6V4M12 6V4M16 6V4M6 9v11M18 9v11M9 13h6v5H9zM12 18v2', interconnone: 'M12 3v5M9 8h6M8 13l8 6M16 13l-8 6',
    placesubstation: 'M3 6h18M3 9h18M8 6V4M12 6V4M16 6V4M6 9v11M18 9v11M9 13h6v5H9zM12 18v2',
    gastiein: 'M12 21c-4 0-6-3-6-6 0-4 4-6 4-9 0 3 3 4 4 6 1-1 1-2 1-3 2 2 3 4 3 6 0 3-2 6-6 6zM12 21v-4',
    /* ── 2 · Design ── */
    designsite: MAP + 'M13 13l4-4 2 2-4 4z',
    substationenvelope: 'M4 4h5M13 4h7M4 20h5M13 20h7M4 4v5M4 13v7M20 4v5M20 13v7M9 9h6v6H9zM12 15v3',
    buildablearea: 'M4 6l8-3 8 4v11l-8 3-8-4zM8 10h8v6H8z',
    fencetie: FENCE, fence: FENCE,
    supplylink: LINK,
    movesystem: 'M12 3v18M3 12h18M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3',
    feasibilitycsv: DOC + 'M9 12h6M9 15h6M9 18h6',
    /* ── 3 · Size & cost ── */
    electricalsizing: 'M12 2L5 13h6l-1 9 8-11h-6l1-9zM17 4h4M17 8h4M17 12h4',
    loadscreen: GAUGE, loadbar: GAUGE, maxload: 'M4 20h16M6 20v-6M10 20v-10M14 20V4M18 20v-8',
    computecost: SERVER + 'M14 6h4M14 16h4',
    landlease: 'M3 20l4-13 14 2-4 11zM10 12h5M9 15h5',
    /* ── Build tab: guided builds and equipment ── */
    derbuild: 'M12 4a2 2 0 1 0 0 .01M5 18a2 2 0 1 0 0 .01M19 18a2 2 0 1 0 0 .01M12 12a2 2 0 1 0 0 .01M12 6v4M7 17l3-3M17 17l-3-3',
    dergeneration: 'M12 4a2 2 0 1 0 0 .01M5 18a2 2 0 1 0 0 .01M19 18a2 2 0 1 0 0 .01M12 12a2 2 0 1 0 0 .01M12 6v4M7 17l3-3M17 17l-3-3',
    autolayout: 'M4 6h16M4 10h16M4 14h16M4 18h10M17 16l3 2-3 2',
    bessbuild: BATTERY, bessbtm: BATTERY + 'M4 3h4', besscabinet: BATTERY, bessconfig: BATTERY, besspad: BATTERY, besssizer: BATTERY + 'M9 4l2-2 2 2',
    fulltopology: 'M12 3v5M12 8H6v4M12 8h6v4M6 12v4M18 12v4M4 16h4M16 16h4M12 12v9',
    level2: CHARGER, dcfcbuild: CHARGER, evcharger: CHARGER, chargerpads: CHARGER, evcatalog: CHARGER, futureev: 'M6 21V9h12v12M9 9V5M15 9V5M4 21h16M9 15h6',
    computebuild: SERVER, datactr: SERVER,
    engineeringbuild: GEAR,
    building: BUILDING, buildingdesigner: BUILDING, buildingnetzero: BUILDING,
    solar: SOLAR, solarpanels: SOLAR, solarstorage: SOLAR, solarbesssizer: SOLAR, solarbess: SOLAR,
    pcsinverter: 'M4 4h16v16H4zM4 20L20 4M6 8h4M6 10h4M13 16c1-2 2-2 3 0s2 2 3 0',
    transformer: TRANSFORMER,
    ups: 'M4 8h13v8H4zM17 10h3v4h-3M7 11h7M12 5v3',
    generator: 'M3 8h13v9H3zM16 11h4v6h-4M6 17v3M13 17v3M7 12l2-2 1 4 2-2',
    utility: 'M12 3l5 18H7zM9 11h6M8 15h8M3 21h18',
    powergen: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM13 7l-4 6h4l-1 4 4-6h-4z',
    sourcepoi: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9 8v3a3 3 0 0 0 6 0V8M12 14v3',
    meter: 'M4 17a8 8 0 0 1 16 0zM12 17l3-6M12 17h.01', meters: 'M3 15a5 5 0 0 1 10 0zM8 15l2-3M12 15a5 5 0 0 1 10 0h-10M17 15l2-3',
    acdisconnect: 'M3 12h5M8 12l6-4M14 12h7M14 9v6',
    panelboard: 'M5 3h14v18H5zM8 7h3M13 7h3M8 11h3M13 11h3M8 15h3M13 15h3',
    junctionbox: 'M4 6h16v12H4zM8 12h.01M12 12h.01M16 12h.01',
    utilitypole: 'M12 3v18M6 6h12M6 6l2 3M18 6l-2 3M8 9h8',
    conduit: 'M3 9h18v6H3zM7 9v6M17 9v6', conduitschedule: TABLE, deleteconduit: 'M3 9h10v6H3zM7 9v6M16 8l5 5M21 8l-5 5',
    concretepad: 'M3 14l9-4 9 4-9 4zM3 14v3l9 4 9-4v-3',
    bollard: 'M9 21h6M10 21V9a2 2 0 0 1 4 0v12M8 9h8M10 5h4',
    firehydrant: 'M9 21h6M10 21V7a2 2 0 0 1 4 0v14M7 11h10M8 8h8M12 3v2',
    parkingstalls: 'M3 6v12M9 6v12M15 6v12M21 6v12M3 6h18',
    evstencil: PLUG, adasymbol: 'M14 5a1.5 1.5 0 1 0 0 .01M13 8v6h5l3 5M9 11a5.5 5.5 0 1 0 7.5 5.5', adaaisle: 'M4 4h16v16H4zM4 12l8-8M4 20L20 4M12 20l8-8', stencilbw: 'M4 4h16v16H4zM8 8h8M8 12h8M8 16h5',
    zonebox: 'M4 4h4M10 4h4M16 4h4M4 20h4M10 20h4M16 20h4M4 4v4M4 10v4M4 16v4M20 4v4M20 10v4M20 16v4',
    clustertools: 'M12 5a2 2 0 1 0 0 .01M5 17a2 2 0 1 0 0 .01M19 17a2 2 0 1 0 0 .01M12 7v3M11 12l-5 4M13 12l5 4M12 12a2 2 0 1 0 0 .01',
    /* ── Insert / Draw / Annotate ── */
    line: 'M4 20L20 4M4 20h.01M20 4h.01',
    polyline: 'M3 18l5-9 5 5 8-10M3 18h.01M8 9h.01M13 14h.01M21 4h.01',
    rectangle: 'M4 6h16v12H4z', circle: 'M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16z',
    textnote: 'M5 5h14M12 5v14M9 19h6', labels: 'M3 12l9-9h9v9l-9 9zM16 8h.01', calloutarrow: 'M4 4h12v8H8l-4 3zM16 12l4 8',
    dimension: 'M4 6v12M20 6v12M4 12h16M7 9l-3 3 3 3M17 9l3 3-3 3',
    calibratescale: RULER, clearscale: RULER + 'M18 18l3 3M21 18l-3 3', setplot: RULER,
    color: 'M12 3a9 9 0 0 0 0 18h1a2 2 0 0 0 1-3.5 2 2 0 0 1 1.5-3.5H18a3 3 0 0 0 3-3 9 9 0 0 0-9-8zM7 12h.01M9 8h.01M14 7h.01',
    uploadimage: 'M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M16 9h.01',
    selectmove: 'M5 3l7 16 2-6 6-2z', deselect: 'M5 4l7 14 2-5 5-2zM16 16l4 4M20 16l-4 4',
    duplicate: 'M8 8h12v12H8zM4 16V4h12', 'delete': 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6', deleteshape: 'M4 5h9v9H4zM15 14l5 5M20 14l-5 5',
    undo: 'M4 10a8 8 0 1 1 1 8M4 3v7h7', redo: 'M20 10a8 8 0 1 0-1 8M20 3v7h-7',
    clearall: 'M4 19l7-7 6 6-4 4H7zM11 12l7-7 3 3-7 7', clearplot: 'M4 19l7-7 6 6-4 4H7zM11 12l7-7 3 3-7 7', clearschematic: 'M4 19l7-7 6 6-4 4H7zM11 12l7-7 3 3-7 7',
    /* ── Analyze ── */
    circuitanalysis: 'M3 12h5l2-5 4 10 2-5h5',
    energybalance: 'M12 3v18M4 21h16M6 7h12M6 7l-3 6a3 3 0 0 0 6 0zM18 7l-3 6a3 3 0 0 0 6 0z',
    generationanalysis: 'M4 20h16M6 16l4-5 3 3 5-7M17 4h.01',
    nonexportheadroom: 'M4 16a8 8 0 0 1 16 0M12 16l-5-5M4 20h16M15 5l4 4',
    noisemodeling: 'M4 10v4h3l4 3V7l-4 3zM15 9a4 4 0 0 1 0 6M18 6a8 8 0 0 1 0 12',
    networkproximity: 'M5 12a2 2 0 1 0 0 .01M19 12a2 2 0 1 0 0 .01M7 12h10M12 9v6',
    gridprequalify: 'M12 3l4 18H8zM9 10h6M8 15h8M17 4l2 2 3-3',
    gridatlas: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18',
    findsubstation: 'M10 4a6 6 0 1 0 0 12 6 6 0 0 0 0-12zM14.5 14.5L20 20M8 8h4v4H8z',
    parcelscreen: 'M4 6l8-3 8 4v11l-8 3-8-4zM10 10a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12.5 15.5L15 18',
    siteprequal: CHECKMAP, siteprescreen: CHECKMAP, sitescore: CHECKMAP,
    diagnose: 'M3 12h4l2-6 3 12 3-8 2 4h4',
    validationstatus: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM9 12l2 2 4-4',
    '2d3dmodelchecks': 'M4 6h8M4 12h8M4 18h8M16 6l3-1.5 3 1.5v3l-3 1.5-3-1.5zM15 17l2 2 4-4',
    '3dreview': CUBE, '3dsitevisualizer': CUBE, digitaltwin: 'M4 8l4-2 4 2v5l-4 2-4-2zM12 11l4-2 4 2v5l-4 2-4-2zM8 6v9M16 9v9',
    projectintelligence: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.6.6 1 1.5 1 2.5h6c0-1 .4-1.9 1-2.5A6 6 0 0 0 12 3z',
    designoptimizer: 'M4 7h10M18 7h2M14 5v4M4 12h3M11 12h9M7 10v4M4 17h12M20 17h.01M16 15v4',
    optimiselayout: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM16 14v6M13 17h6',
    viabilityworkflow: 'M4 18h4v-4H4zM10 13h4V9h-4zM16 8h4V4h-4zM8 16h2M14 11h2',
    /* ── Estimate ── */
    electricalestimate: DOC + 'M13 10l-3 5h3l-1 4 3-5h-3z',
    constructioncost: 'M4 16h16M6 16a6 6 0 0 1 12 0M12 8V4M9 20h6',
    bomsourcing: 'M4 6h3v3H4zM4 11h3v3H4zM4 16h3v3H4zM10 7h10M10 12h10M10 17h10',
    valuestack: 'M4 20h16M6 20v-5h4v5M10 20v-9h4v9M14 20V6h4v14',
    pricedecks: 'M4 6h16v13H4zM4 10h16M8 15h3',
    applyforfinancing: DOC + 'M12 10v9M10 12h3a1.5 1.5 0 0 1 0 3h-2a1.5 1.5 0 0 0 0 3h3',
    importbill: DOC + 'M12 10v7M9 14l3 3 3-3',
    proposal: DOC + 'M9 13h6M9 17h6', specsheet: DOC + 'M9 12h6M9 15h6M9 18h4', summary: 'M6 3h12v18H6zM9 8h6M9 12h6M9 16h4',
    /* ── Output ── */
    blueprintpdf: 'M4 4h16v16H4zM8 8h8v8H8zM8 12h8M12 8v8',
    plotplane0e11: 'M4 4h16v16H4zM4 9h16M9 9v11M14 12h4M14 15h4',
    onelinee20: 'M3 6h6M9 6l3 3M12 9v6M12 15l-3 3H3M15 6h6M15 18h6M12 9h3M12 15h3',
    schematiceditor: 'M3 7h5l3 5-3 5H3M11 12h4M15 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM18 12h3',
    permitsheet: 'M6 3h12v18H6zM9 8h6M9 12h6M14 17a2 2 0 1 0 0 .01', permitcreator: DOC + 'M9 14l2 2 4-4',
    interactivereport: DOC + 'M9 17v-3M12 17v-6M15 17v-4',
    exportforcad: EXPORT, exportforvalidation: EXPORT + 'M17 9l2 2 3-3', geoexport: EXPORT, exporttomonday: EXPORT,
    pushtomarketplace: 'M3 10l2-5h14l2 5H3zM5 10v10h14V10M12 13v5M10 16l2 2 2-2',
    synctocrm: 'M8 7a3 3 0 1 0 0 .01M3 19a5 5 0 0 1 10 0M20 8a4 4 0 0 0-7 2M13 16a4 4 0 0 0 7-2M20 5v3h-3M13 19v-3h3',
    crmintegration: 'M8 7a3 3 0 1 0 0 .01M3 19a5 5 0 0 1 10 0M15 9h6M18 6v6M15 15h6',
    siteplanstyles: 'M4 4h16v16H4zM8 8h4v4H8zM14 8h2M14 12h2M8 16h8',
    /* ── View / map ── */
    sitemap: MAP, layoutsite: 'M4 4h16v16H4zM4 12h16M12 4v16', lockmap: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4',
    layers: LAYERS, gislayers: LAYERS, nativelayer: LAYERS, terrainlayer: 'M3 18l5-8 4 5 3-4 6 7zM3 18h18M16 6h.01', terrainkey: 'M3 18l5-8 4 5 3-4 6 7zM3 18h18M16 6h.01',
    '3deptiles': 'M3 5h18v14H3zM9 5v14M15 5v14M3 12h18',
    compass: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM15 9l-2 5-5 2 2-5z',
    coordinates: 'M12 3v18M3 12h18M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z', crosshair: 'M12 4v4M12 16v4M4 12h4M16 12h4M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
    recenter: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM12 3v3M12 18v3M3 12h3M18 12h3',
    gpsplace: 'M12 21s-7-6.5-7-11a7 7 0 0 1 14 0c0 4.5-7 11-7 11zM12 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
    camera: 'M4 8h4l2-3h4l2 3h4v11H4zM12 17a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
    dockleft: 'M3 4h18v16H3zM9 4v16', dockcenter: 'M3 4h18v16H3zM3 10h18',
    designermode: 'M3 21l6-1 11-11-5-5L4 15zM13 6l5 5M3 21l1-6', architecturemode: 'M12 3v4M12 7l-6 14M12 7l6 14M8 17h8',
    /* ── Settings ── */
    aikeys: 'M8 14a4 4 0 1 1 0-8 4 4 0 0 1 0 8zM11 11l9 9M17 17l2-2M14 20l2-2', nrelkey: 'M8 14a4 4 0 1 1 0-8 4 4 0 0 1 0 8zM11 11l9 9M17 17l2-2', mapskey: MAP + 'M13 11l4 4M16 12l2 2',
    fleetom: 'M3 6h11v9H3zM14 9h4l3 3v3h-7M6 18a1.5 1.5 0 1 0 0 .01M17 18a1.5 1.5 0 1 0 0 .01', omlifecycle: 'M20 12a8 8 0 0 1-14 5M4 12a8 8 0 0 1 14-5M18 3v4h-4M6 21v-4h4'
  };
  /* dynamic labels: the interconnection button names its mode; the load bar its figure */
  var PREFIXES = [['intercon', SERVICE], ['loadbar', GAUGE]];
  /* the loose second tier, kept for a label not yet in the table */
  var GLYPHS = [
    [/battery|bess|storage/i, BATTERY], [/charg|ev |dcfc|level.?2/i, CHARGER], [/solar|generation|sun/i, SOLAR],
    [/cost|budget|estimate|finance|value|bill/i, 'M4 3h16v18H4zM7 7h10M7 11h3M14 11h3M7 15h3M14 15h3'],
    [/export|print|report|sheet|proposal|pdf/i, DOC + 'M8 12h8M8 16h8'], [/layer|map|site|plot|terrain|parcel/i, MAP],
    [/line|draw|rect|circle|annot|text|dimension|calib|scale/i, 'M3 21l2-6L17 3l4 4L9 19zM14 6l4 4M3 21l6-2'],
    [/undo|redo|reset|clear/i, 'M4 10a8 8 0 1 1 1 8M4 3v7h7'], [/setting|config|library/i, 'M4 6h16M4 12h16M4 18h16M8 3v6M16 9v6M10 15v6'],
    [/build|equipment|insert|pad|fence/i, CUBE]
  ];
  /* label: the button's own caption; text: the whole button's text as a second chance */
  function pathFor(label, text) {
    var k = key(label);
    if (k && ICONS[k]) return ICONS[k];
    for (var i = 0; i < PREFIXES.length; i++) if (k.indexOf(PREFIXES[i][0]) === 0) return PREFIXES[i][1];
    var t = String(text == null ? label : text);
    for (var g = 0; g < GLYPHS.length; g++) if (GLYPHS[g][0].test(t)) return GLYPHS[g][1];
    return FALLBACK;
  }
  return { pathFor: pathFor, key: key, FALLBACK: FALLBACK, ICONS: ICONS, PREFIXES: PREFIXES };
});
