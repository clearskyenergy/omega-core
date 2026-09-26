/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * Sole packaging ownership catalog. Pure ES5; no prices and no implicit grants.
 * package-catalog projects this data for browsers; do not copy it into a runtime.
 */
'use strict';
function words(s) { return s ? s.split(' ') : []; }
function record(key, name, shelf, tools, caps, ribbon, meter, requires) {
  return { key: key, name: name, shelf: shelf, tools: words(tools), caps: words(caps),
    ribbon: words(ribbon), menu: [], addons: key === 'lite' ? [] : [key], meter: meter || null,
    requires: requires || (key === 'lite' ? [] : ['lite']) };
}
var CATALOG = [
  record('lite', 'Lite', 'floor', 'editor sandbox sales intake opportunity financing signal',
    'design view export.blueprint',
    'openSiteQuickBuild openAutoLayout rbInsert rbMode stampEV stampADA stampADAAisle openEvChargerDialog openSourceDialog setUtilityType derSetSolar derSetWind derSetAlt derCustomKw openArrayProps omegaCanopyCustom omegaSolarCustomArea openClusterDialog _openPadConfig evSetPost evSetUnit evSetL2 setSubstationMode openMvCableDialog openConduitMenu _bessRunPanel _cdOpenTab _geoRepairAndReport wireAllBessToHub toggleEngMode toggleConduitLabels engSchedToggleVisible addTextBox ctxDuplicate deleteSelectedConduit deleteSelectedShape clearConduitSel clearSchematic undoLast delSel startCal clearScale clearAll ovUpload ovStencil openGpsPlacement recenterOnEquipment omegaPvViewCycle toggle3D nnToggleCrosshair toggleMeterPanel toggleSitePanel toggleNativeLayer toggleDockLeft toggleDiagPanel toggleCompassPanel toggleLayersPanel opToggleCoords openBlueprintExport openProposalExport openReport exportSpecSheet exportToMonday openMapsKey openCrmSettings openCrmSync openAiKeys newProject openProjectsModal saveProject omegaPrint e3BrowserOpen rbNav omegaLoadMap setMode'),
  record('gridatlas', 'Grid Atlas', 'addon', 'gridatlas interconnect comedcap', 'gridatlas',
    'openComedPreQual OmegaSubstation.open'),
  record('storage', 'Storage Sizing & Revenue', 'standard', 'batterysizer proforma valuestack isocalc', 'storage',
    'openBessSizer openSolarBessSizer openBillImport openNonExportCalc openEnergyBalance openValueStack openBillAnalysis', 'models'),
  record('estimate', 'Estimate, BOM & Procurement', 'standard', 'costestimator', 'estimate',
    'openBomSourcing openElectricalEstimate openTakeoffBudget exportBudgetCSV exportTrenchCSV exportEstimateCSV', 'boms'),
  record('evrebates', 'EV Rebates & Closeout', 'standard', 'evcostwb evcloseout', 'evrebates',
    'markFutureEV', 'evApplications'),
  record('plansets', 'Plan Sets & CAD', 'premium', '', 'plansets schematic riser export.plotplan export.oneline',
    'openPlotPlanExport openOneLineExport exportSpecsForCADTool d4Open OmegaArch.open OmegaArch.review OmegaSchematicTool.open openRiser openSchematic openPermitSheet openSheetSet openSiteStyles openBuildingDesigner openDesignReview OmegaAIRender.open'),
  record('siteintel', 'Site Intelligence', 'premium', '', 'siteintel parcelscreen',
    'openScorePanel openNetworkProximity openProjectIntelligence opToggleTerrainKey tlCycle ttCycle e5Open', 'screens'),
  record('engineering', 'Engineering & Analysis', 'premium', 'conductorsizing powerflow siteoptimizer', 'engineering',
    'openDerAnalysis openValidationExport openValidationStatus e3MeteoOpen'),
  record('finance', 'Investor & Finance', 'premium', 'investment dcfc fleet apartment degradation', 'finance',
    'openMarketplacePush openFinancingApply openBuildingPanel'),
  record('compute', 'Compute & Data Center', 'premium', 'datacenter computepower computelease', 'compute',
    'openDcClusterDialog derSetDc'),
  record('ops', 'Operations', 'premium', 'sitelifecycle omconsole slaintel fieldservice ownerreport fleetcommand', 'ops', ''),
  record('whitelabel', 'White Label Storefront', 'premium', '', 'whitelabel', ''),
  record('permitting', 'Permitting Matrix', 'deliverable', '', 'permitting', 'OmegaPermitMatrix.open', 'matrices'),
  record('sitefinder', 'Site Finder', 'deliverable', 'sitefinder sitediscovery', 'sitefinder', '', 'siteStudies'),
  record('logic-office', 'Office', 'platform', '', 'logic-office', ''),
  record('logic-plant', 'Plant', 'platform', '', 'logic-plant', '', null, ['lite', 'logic-office']),
  record('logic-materials', 'Materials & Purchasing', 'platform', '', 'logic-materials', '', null, ['lite', 'logic-office']),
  record('logic-logistics', 'Logistics & Warranty', 'platform', '', 'logic-logistics', '', null, ['lite', 'logic-office']),
  record('logic-customer', 'Customer App', 'platform', '', 'logic-customer', '', null, ['lite', 'logic-office'])
];
var NOT_SOLD = [
  { key: 'osaportal', reason: 'JV agreement', tools: ['osaportal'], ribbon: [] },
  { key: 'spatco_ev', reason: 'Tenant extension', tools: ['spatco_ev'], ribbon: [] },
  { key: 'intake_admin', reason: 'Staff queue', tools: ['intake_admin'], ribbon: [] },
  { key: 'placeholders', reason: 'Not shipped', tools: ['ahj', 'aggregators', 'offtakers', 'procurement'], ribbon: [] },
  { key: 'interconnectstudy', reason: 'Enterprise contract only; not granted by Engineering', tools: ['interconnectstudy'], ribbon: [] },
  { key: 'unfinished', reason: 'Hidden, retiring or unwired; not included in any package', tools: ['permit'],
    ribbon: ['omegaPermitBeta', 'openSitePreQual', 'openSitePreScreen', 'openPriceDecks', 'omegaDigitalTwinSoon', 'openViabilityWorkflow', 'openBessModal', 'openLaborProposal', 'openSiteCapture'] }
];
var BY_KEY = {};
CATALOG.forEach(function (m) { BY_KEY[m.key] = m; });
/* Argument-sensitive launchers must never grant Compute from the Lite build family. */
BY_KEY.lite.ribbon = BY_KEY.lite.ribbon.concat(["_guidedPick('der')", "_guidedPick('standard')", "_guidedPick('deluxe')", "_guidedPick('l2')", "_guidedPick('ev')", "homeStartWizard('FOM')", "openRpPanel('summary')"]);
BY_KEY.compute.ribbon.push("_guidedPick('compute')");
BY_KEY.estimate.ribbon.push("openRpPanel('cost')");
NOT_SOLD[5].ribbon.push("homeStartWizard('BTM')");
var IDS = {
  lite: 'rb-color rb-fom rb-fence-tie rb-move-system rb-cluster rb-labels rb-evselbl rb-engbuild rb-omega-mode rb-redo rb-trace-boundary rb-design-ai rb-nrel-key',
  gridatlas: 'rb-gridatlas', storage: 'omega-btn-bill-analysis rb-valuestack rb-omlife',
  estimate: 'rb-takeoff-budget', evrebates: 'rb-ev-future',
  plansets: 'ov-airender omega-btn-riser omega-btn-sldcheck omega-btn-drc rb-bldg-designer rb-cad-schem rb-permit-sheet rb-sheet-mgr rb-siteplan rb-geo-export rb-arch-cad ov-ribbon-btn ov-model-checks',
  siteintel: 'rb-noise-model rb-buildable rb-trace-exclusion rb-gis-layers rb-parcel-screen',
  engineering: 'rb-optimizer rb-optimise rb-elec rb-circuit omega-terr-btn',
  compute: 'rb-sub-envelope rb-feas-csv rb-place-sub rb-gas-tie rb-fiber-tie rb-max-fit rb-site-build rb-max-load rb-load-screen rb-compute-cost rb-supply-link rb-intercon rb-compute-lease rb-design-site rb-ladder-toggle rb-compute-site-setup',
  permitting: 'omega-btn-permit-matrix'
};
NOT_SOLD[5].ribbon.push('#rb-screen', 'sendToPermitCreator');
BY_KEY.lite.ribbon = BY_KEY.lite.ribbon.concat(words('shapeArc shapeEllipse shapePolygon shapeHatchBox ovLock setPlot clearPlot'));
Object.keys(IDS).forEach(function (k) { words(IDS[k]).forEach(function (id) { BY_KEY[k].ribbon.push('#' + id); }); });
/* Honest beta disclosures travel with the one catalog projection. Hidden
 * stubs remain NOT_SOLD and are never turned into included features. */
BY_KEY.plansets.beta = ['3D Site Visualizer', 'Georeferenced Export', 'Export for CAD'];
BY_KEY.siteintel.beta = ['Noise Modeling'];
BY_KEY.engineering.beta = ['Design Optimizer', 'Export for Validation'];
BY_KEY.storage.beta = ['Bill Analysis'];
BY_KEY.permitting.beta = ['Permitting Matrix'];
BY_KEY.permitting.coverage = 'Verified Vista / SDG&E pack; other jurisdictions are draft matrices with unverified agencies, fees and durations.';
BY_KEY.sitefinder.coverage = 'Northern Illinois (ComEd) only.';
BY_KEY.whitelabel.agreement = 'Reseller addendum required';
var STARTERS = {
  ev: ['lite', 'evrebates', 'estimate', 'gridatlas', 'plansets'],
  solar: ['lite', 'storage', 'estimate', 'plansets'],
  developer: ['lite', 'gridatlas', 'storage', 'finance'],
  epc: ['lite', 'plansets', 'engineering', 'estimate', 'permitting'],
  oem: ['lite', 'whitelabel', 'storage', 'estimate'],
  distributor: ['lite', 'whitelabel', 'estimate'],
  compute: ['lite', 'compute', 'gridatlas', 'siteintel'],
  capital: ['lite', 'finance', 'gridatlas']
};
function copy(x) { return JSON.parse(JSON.stringify(x)); }
function fail(message) { var e = new Error(message); e.status = 400; throw e; }
function normalize(keys) {
  if (!Array.isArray(keys) || !keys.length || keys.length > CATALOG.length) fail('Select a package including Lite');
  var seen = {};
  keys.forEach(function (k) {
    if (typeof k !== 'string' || !Object.prototype.hasOwnProperty.call(BY_KEY, k)) fail('Unknown module');
    if (seen[k]) fail('Duplicate module: ' + k);
    seen[k] = true;
  });
  if (!seen.lite) fail('Every package requires Lite');
  keys.forEach(function (k) { BY_KEY[k].requires.forEach(function (r) { if (!seen[r]) fail(k + ' requires ' + r); }); });
  return CATALOG.filter(function (m) { return !!seen[m.key]; }).map(function (m) { return m.key; });
}
function resolve(keys) {
  var modules = normalize(keys), out = { modules: modules, tier: 'standard', addons: [], toolAccess: [], caps: [], ribbon: [] };
  modules.forEach(function (k) {
    var m = BY_KEY[k];
    ['addons', 'caps', 'ribbon'].forEach(function (p) { m[p].forEach(function (v) { if (out[p].indexOf(v) < 0) out[p].push(v); }); });
    m.tools.forEach(function (v) { out.toolAccess.push(v); });
    if (m.shelf === 'premium' || m.shelf === 'deliverable') out.tier = 'deluxe';
  });
  /* Compatibility metadata only. Packaged clients must use caps, not this tier. */
  return out;
}
function matches(selector, id, handler) {
  if (selector.charAt(0) === '#') return selector.slice(1) === id;
  var compact = String(handler || '').replace(/\s/g, '').replace(/"/g, "'");
  if (selector.indexOf('(') >= 0) return compact.indexOf(selector) >= 0;
  return new RegExp('(^|[^a-zA-Z0-9_$])' + selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?=[^a-zA-Z0-9_$]|$)').test(compact);
}
function owners(id, handler) {
  return CATALOG.concat(NOT_SOLD).filter(function (m) {
    return m.ribbon.some(function (s) { return matches(s, id, handler); });
  }).map(function (m) { return m.key; });
}
module.exports = { catalog: function () { return copy(CATALOG); }, notSold: function () { return copy(NOT_SOLD); },
  starters: function () { return copy(STARTERS); }, get: function (key) { return Object.prototype.hasOwnProperty.call(BY_KEY, key) ? copy(BY_KEY[key]) : null; },
  normalize: normalize, resolve: resolve, owners: owners };
