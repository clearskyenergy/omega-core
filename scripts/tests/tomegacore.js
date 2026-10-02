#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   Omega-Core: the skid in the Compute options, the CleanCell R60 in the
   battery catalog, and Output › Omega-Core qualifying a charging site on
   power, location and fiber with the host's land lease and the 5-year terms
   (Tommy, 2026-10-02).

   Held here, each failing when its piece is removed:
     1 · the model (api/_lib/omega-core.js): the product facts, the three
         gates, fiber as the hard gate (compute-lease's own), the drawing's
         transformer never passing the power gate, fewer skids when the power
         carries fewer, the lease and buyout arithmetic, what the Run's
         numbers become, and who sees the card
     2 · the door (api/omega-core.js): Omega Compute in a package, the body
     3 · the editor: the catalog row, the flyout, the stamp at placement,
         the skid kept OUT of the host's load, cost and site type, the
         Output button, its owner module, its icon, the client module, the
         project field saved and restored, and the R60 entry
     4 · the client's collect(), run against a drawing

     node scripts/tests/tomegacore.js */
'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm');
var ROOT = path.join(__dirname, '..', '..');
var ED = fs.readFileSync(path.join(ROOT, 'editor.html'), 'utf8');
var pass = 0, fail = 0;
function ok(c, l, x) { if (c) pass++; else { fail++; console.error('  FAIL  ' + l + (x != null ? '\n        ' + x : '')); } }
function eq(got, want, l) { ok(got === want, l, 'got ' + JSON.stringify(got) + ', want ' + JSON.stringify(want)); }
function bodyFrom(src, needle) {
  var at = src.indexOf(needle);
  if (at < 0 || src.indexOf(needle, at + 1) >= 0) throw new Error(needle + ' must appear exactly once');
  var k = src.indexOf('{', at), d = 0;
  for (;; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (!d) break; } }
  return src.slice(at, k + 1);
}
function clone(o) { return JSON.parse(JSON.stringify(o)); }

/* ═══ 1 · the model ═══════════════════════════════════════════════════ */
var D = require('../_lib/firestore-double');
var OC = require('../../api/_lib/omega-core');
var CL = require('../../api/compute-lease')._model;

eq(OC.PRODUCT.systemCostUsd, 450000, 'the system costs $450,000 a skid');
eq(OC.PRODUCT.compute.kw, 75, '75 kW of compute');
eq(OC.PRODUCT.battery.kwh, 61.44, 'the R60: 61.44 kWh (datasheet)');
eq(OC.PRODUCT.battery.kw, 60, 'the R60: 60 kW through the Sol-Ark 60K');
eq(OC.PRODUCT.battery.maxAcA, 72.3, 'the R60: 72.3 A max AC output (datasheet)');
eq(OC.PRODUCT.skid.lengthIn + 'x' + OC.PRODUCT.skid.depthIn, '336x87', 'the skid is 336 x 87 in');
eq(OC.PRODUCT.skid.heightIn, 82.75, '82.75 in overall');
eq(OC.TERMS.minTermYears, 5, 'a 5-year minimum');
ok(/turn the meter off/.test(OC.TERMS.remove) && /fair market value/.test(OC.TERMS.buyout), 'the end of term: removal and meter off, or a buyout at fair market value');
ok(/own utility service and meter/.test(OC.TERMS.meter), 'the skid is on its own meter');
eq(OC.serviceAmps(135, 480, 0.95), 225, 'a skid at full peak is a 225 A 480 V service');
eq(OC.RATE_CARD.lateralPerMile, CL.RATE_CARD.lateralPerMile, 'one fiber-lateral band with compute-lease');

/* the reference charging site: everything on evidence */
var GOOD = {
  site: { name: 'Main St Charging', address: '1 Main St, Edison, NJ', lat: 40.52, lng: -74.41 },
  drawing: { units: 1, chargers: { dcfcUnits: 4, dcfcKw: 600, l2Units: 2, l2Kw: 38, ports: 10 }, xfmrKva: 1500, dcLoadKw: 0 },
  run: { capex: 1400000, incentive: 300000, annualRevenue: 220000, at: '2026-10-01T00:00:00Z' },
  evidence: {
    gridAtlas: { score: 80, nearestSubKm: 1.2, maxKv: 69 },
    network: { verdict: 'likely', reasons: ['metro fiber at 0.1 mi'], lateral: { mi: 0, costLow: 0, costHigh: 0 } },
    parcel: { ok: true, zoning: 'C-3', owner: 'MAIN ST HOLDINGS LLC', apn: '12-34', county: 'Middlesex' }
  },
  rep: { availableKw: 400, willServe: 'confirmed', fiberOnSite: 'yes', fiberDownMbps: 1000, fiberUpMbps: 1000,
         hostWilling: 'yes', termYears: 5, endOfTerm: 'remove' }
};
var r = OC.evaluate(GOOD, {});
eq(r.verdict, 'qualified', 'a charging site with a will-serve, commercial zoning and gig fiber qualifies');
eq(r.gates.power.status, 'pass', 'power passes on the utility\'s confirmed figure');
eq(r.gates.location.status, 'pass', 'location passes: chargers drawn, commercial zoning, located');
eq(r.gates.fiber.status, 'pass', 'fiber passes on 1 Gbps symmetric on site');
eq(r.units.proposed, 1, 'one skid proposed');
eq(r.offer.monthlyPerSkid.base, 1000, 'the lease opens at $1,000 a skid a month');
eq(r.offer.annual.base, 12000, '$12,000 a year');
eq(r.offer.termTotal.base, Math.round(CL.escalatedTotal(12000, 0.025, 5)), 'the term total escalates 2.5% over 5 years');
eq(r.host.run.netCost, 1100000, 'the Run\'s capex less its incentives');
eq(r.host.paybackYearsBefore, 5, 'payback before: 1.1M / 220k');
eq(r.host.paybackYearsAfter, Math.round(1100000 / 232000 * 10) / 10, 'payback after: the lease added to the Run\'s revenue');
eq(r.host.revenueUpliftPct, Math.round(12000 / 220000 * 1000) / 10, 'the lease as a share of year-one revenue');
eq(r.program.systemCost, 450000, 'ClearSky\'s system cost for one skid');
eq(JSON.stringify(r.program.fmvAtEndPerSkid), JSON.stringify({ low: 90000, base: 135000, high: 180000 }), 'fair market value at year 5: 20 / 30 / 40% of $450k, indicative');
eq(r.terms.minTermYears, 5, 'the terms carry the 5-year minimum');
eq(r.terms.endOfTerm.preference, 'remove', 'and the host\'s end-of-term preference');
ok(/appraisal/.test(r.disclaimer), 'the disclaimer says FMV is an appraisal');
eq(r.rateCard.disclosed, false, 'a tenant does not see the card build-up');
ok(!r.rateCard.buildUp, 'no build-up off staff');
ok(OC.evaluate(GOOD, { disclose: true }).rateCard.buildUp, 'staff see the build-up');

/* fiber is the hard gate and it is compute-lease's own */
var noFiber = clone(GOOD); noFiber.rep.fiberOnSite = 'no'; noFiber.evidence.network = { verdict: 'unlikely', reasons: [] };
var nf = OC.evaluate(noFiber, {});
eq(nf.verdict, 'disqualified', 'no fiber and fiber unlikely: disqualified however good the power is');
eq(nf.offer, null, 'and no lease is priced');
eq(JSON.stringify(OC.gateFiber(GOOD.rep, GOOD.evidence).status), JSON.stringify(CL.gateFiber(GOOD.rep, GOOD.evidence).status), 'the fiber gate is compute-lease\'s gateFiber');
var withFile = OC.gateFiber({}, { fiberOnFile: { nearestRoute: { distanceM: 1609.344, operator: 'Zayo' } } });
ok(withFile.basis.some(function (b) { return /1 mi \(Zayo\)/.test(b); }), 'fiber already on the project is reported');
eq(withFile.status, CL.gateFiber({}, {}).status, 'and never moves the gate');

/* location */
var resi = clone(GOOD); resi.rep.zoningCode = 'R-1';
eq(OC.evaluate(resi, {}).gates.location.status, 'fail', 'residential zoning fails location');
eq(OC.evaluate(resi, {}).verdict, 'disqualified', 'and disqualifies');
var noEv = clone(GOOD); noEv.drawing.chargers = {};
eq(OC.evaluate(noEv, {}).gates.location.status, 'conditional', 'no chargers drawn: conditional — Omega-Core is for charging sites');
var noPt = clone(GOOD); noPt.site = {};
eq(OC.evaluate(noPt, {}).gates.location.status, 'unconfirmed', 'no map point: unconfirmed');

/* power */
var declined = clone(GOOD); declined.rep.willServe = 'none';
eq(OC.evaluate(declined, {}).gates.power.status, 'fail', 'a declined will-serve fails power');
var tiny = clone(GOOD); tiny.rep.availableKw = 50;
eq(OC.evaluate(tiny, {}).gates.power.status, 'fail', 'the utility\'s 50 kW is under one skid: fails');
var drawn = clone(GOOD); delete drawn.rep.availableKw; drawn.rep.willServe = 'unknown';
var dp = OC.evaluate(drawn, {}).gates.power;
eq(dp.status, 'conditional', 'the drawn transformer shows room: conditional, never pass');
eq(dp.headroomSource, 'drawing', 'and says the headroom is the drawing\'s');
eq(dp.headroomKw, Math.round(1500 * 0.95 - 638), 'headroom = kVA x pf - the host\'s drawn chargers');
var full = clone(drawn); full.drawing.xfmrKva = 500;
eq(OC.evaluate(full, {}).gates.power.status, 'unconfirmed', 'a full drawn transformer is unconfirmed, never a fail on a drawing alone');
var many = clone(GOOD); many.rep.units = 6; many.rep.availableKw = 300;
var mr = OC.evaluate(many, {});
eq(mr.units.supported, 4, '300 kW carries 4 skids at the compute load');
eq(mr.units.proposed, 4, 'the lease is priced on the 4 the power carries, never the 6 asked');
eq(mr.offer.monthly.base, 4000, '4 skids at base');
ok(mr.findings.some(function (f) { return /supports 4 of the 6/.test(f.text); }), 'and says so');
var nothing = OC.evaluate({ rep: {} }, {});
eq(nothing.gates.power.status, 'unconfirmed', 'nothing known: power unconfirmed');
eq(nothing.verdict, 'incomplete', 'nothing known: incomplete, indicative — never disqualified for not asking');
ok(nothing.asks.length >= 4, 'and a call list');
eq(nothing.offer.units, 1, 'one skid by default');

/* terms and the Run */
var shortT = clone(GOOD); shortT.rep.termYears = 3;
eq(OC.evaluate(shortT, {}).offer.termYears, 5, 'a term under 5 years is priced at the 5-year minimum');
ok(OC.evaluate(shortT, {}).asks.some(function (a) { return /program minimum is 5/.test(a.ask); }), 'and the host is told the minimum');
var longT = clone(GOOD); longT.rep.termYears = 10;
eq(OC.evaluate(longT, {}).program.fmvAtEndPerSkid.base, Math.round(450000 * 0.09 / 1000) * 1000, 'a longer term leaves less value: 0.3^2 at year 10');
var noRun = clone(GOOD); delete noRun.run;
var nr2 = OC.evaluate(noRun, {});
eq(nr2.host.paybackYearsBefore, null, 'no Run: no payback invented');
ok(nr2.host.notes.some(function (n) { return /Run the site/.test(n); }), 'and it asks for the Run');
var stale = clone(GOOD); stale.run.stale = true;
ok(OC.evaluate(stale, {}).host.notes.some(function (n) { return /changed after the last Run/.test(n); }), 'a stale Run is said');
var noRev = clone(GOOD); noRev.run.annualRevenue = 0;
eq(OC.evaluate(noRev, {}).host.revenueUpliftPct, null, 'a Run with no revenue: no uplift percentage');

/* ═══ 2 · the door ═════════════════════════════════════════════════════ */
var ctx, member, org;
D.mock('../api/_lib/verify-token', {
  authenticateWithTier: function () { return Promise.resolve(ctx); },
  readAsCaller: function (token, p) { return Promise.resolve(/\/members\//.test(p) ? member : org); },
  httpError: function (status, message) { return Object.assign(new Error(message), { status: status }); }
});
delete require.cache[require.resolve('../../api/compute-lease')];
var handler = require('../../api/omega-core');
function setup(modules, tier, orgId) {
  org = { status: 'active', name: 'Concord Energy' }; member = { role: 'member', status: 'active' };
  ctx = { caller: { uid: 'u1', email: 'a@' + (orgId || 'example.com'), orgId: orgId || 'example.com', emailVerified: true, staff: false },
          tier: tier || 'enterprise',
          billing: modules ? { packaged: true, packagingState: 'paid', accessUntil: Date.now() + 86400000, modules: modules, toolOverrides: {}, addons: [] }
                           : { tier: tier || 'enterprise', toolOverrides: {} } };
}
function call(method, body) {
  var out = {}, res = { setHeader: function () {}, status: function (n) { out.status = n; return res; }, json: function (j) { out.body = j; return res; } };
  return Promise.resolve(handler({ method: method, headers: { authorization: 'Bearer t' }, body: body || {} }, res)).then(function () { return out; });
}
function expect(code, label, body) { return call('POST', body === undefined ? { rep: {} } : body).then(function (o) { eq(o.status, code, label + (o.status !== code ? ' — ' + JSON.stringify(o.body && o.body.error) : '')); return o; }); }
var doorChecks = [
  function () { setup(null); return call('GET').then(function (o) {
    eq(o.status, 200, 'GET answers'); eq(o.body.product.name, 'Omega-Core', 'with the product\'s name and size');
    ok(!/450000/.test(JSON.stringify(o.body)), 'never the price on an unauthenticated GET');
    ok(!o.body.rateCard.monthlyPerSkid, 'and never the lease card'); }); },
  function () { setup(null); return expect(400, 'a body without rep:{} is a 400', {}); },
  function () { setup(null); return expect(200, 'a legacy Enterprise member is answered').then(function (o) {
    eq(o.body.brand.name, 'Concord Energy', 'carrying their own brand'); }); },
  function () { setup(null, 'trial'); return expect(403, 'a legacy trial does not open the compute cap: refused, as the button is hidden'); },
  function () { setup(null, 'standard'); return expect(403, 'nor does Standard'); },
  function () { setup(null, 'standard'); ctx.billing.addOns = { live: ['compute'], accessUntil: Date.now() + 86400000 };
    return expect(200, 'Standard with a live Omega Compute add-on is answered'); },
  function () { setup(null, 'trial', 'sunesol.com'); return expect(200, 'a JV org opens compute on any tier'); },
  function () { setup(null); ctx.billing.toolAccess = ['gridatlas']; return expect(403, 'a product without Site Map is refused'); },
  function () { setup(null); ctx.billing.toolAccess = ['editor', 'gridatlas']; return expect(200, 'a product with Site Map is answered'); },
  function () { setup(null); member.toolAccess = ['gridatlas']; return expect(403, 'a member without Site Map is refused'); },
  function () { setup(null); member.status = 'disabled'; return expect(403, 'a disabled member is refused'); },
  function () { setup(null); ctx.billing.toolOverrides = { omegacore: false }; return expect(403, 'Omega-Core switched off refuses it'); },
  function () { setup(null); ctx.billing.toolOverrides = { computelease: false }; return expect(403, 'the Land Lease tool switched off refuses it'); },
  function () { setup(null); org.status = 'pending'; return expect(403, 'a workspace still being set up is refused'); },
  function () { setup(null); org.status = 'suspended'; return expect(403, 'a suspended workspace is refused'); },
  function () { setup(null); org = null; return expect(200, 'a missing omega_orgs record fails open, as the editor gate does'); },
  function () { setup(['lite']); return expect(403, 'a package without Omega Compute is refused'); },
  function () { setup(['lite']); ctx.billing.toolOverrides = { omegacore: true, computelease: true }; ctx.billing.addons = ['compute'];
    return expect(403, 'and no override or addon forges it'); },
  function () { setup(['lite', 'compute']); return expect(200, 'Omega Compute in the package: answered'); },
  function () { setup(null, 'trial'); ctx.caller.staff = true; return expect(200, 'staff are answered').then(function (o) { ok(!!o.body.rateCard.buildUp, 'and see the card'); }); }
];

/* ═══ 3 · the editor ═══════════════════════════════════════════════════ */
function editorChecks() {
  /* the catalog row, evaluated as tztmm.js does */
  var sb = {}; vm.createContext(sb);
  vm.runInContext(ED.slice(ED.indexOf('var DC_CATALOG = {'), ED.indexOf('/* END ZTMM PLANNER */')) + ';this.DC=DC_CATALOG;', sb);
  var row = sb.DC.dc_omegacore;
  ok(row && row.omegaCore === true && row.ownMeter === true, 'DC_CATALOG has dc_omegacore, on its own meter');
  eq(row && row.lf + 'x' + row.wf, '28x7.25', 'the skid draws 28 x 7.25 ft (336 x 87 in)');
  eq(row && row.kw, 75, '75 kW of compute');
  eq(row && row.bessKwh, 61.44, 'the R60 on the skid: 61.44 kWh');
  eq(row && row.bessKey, 'CC-R60', 'one source for the battery: BESS_CATALOG[\'CC-R60\']');
  ok(!/450/.test(JSON.stringify(row)), 'the price is not in the browser');
  ok(/onclick="rbFlyDo\('fly-dc',function\(\)\{derSetDc\('dc_omegacore'\)\}\)"[^>]*>.*Omega-Core Skid/.test(ED), 'Draw › Data Ctr has Omega-Core Skid');

  /* placement stamps the flag and the battery */
  var P = { S: { shapes: [], shapeStyle: '' }, DC_CATALOG: sb.DC, _derDcId: 'dc_omegacore', uid: function () { return 'x1'; },
            renderShape: function () {}, updShapeCount: function () {}, pushHist: function () {}, _derSnapPt: function (p) { return p; },
            _derScaled: function () { return false; }, _derBanner: function () {} };
  vm.createContext(P);
  vm.runInContext(ED.slice(ED.indexOf('var DERC_DC = (function () {'), ED.indexOf('/* Wind turbines (kW nameplate each)')), P);
  vm.runInContext(bodyFrom(ED, 'function _derDcSpec(id){'), P);
  vm.runInContext(bodyFrom(ED, 'function _derPlaceDcPad(p){'), P);
  vm.runInContext('_derPlaceDcPad({x:10,y:20})', P);
  var sh = P.S.shapes[0];
  ok(sh && sh.kind === 'derdc' && sh.omegaCore === true && sh.ownMeter === true, 'a placed skid carries omegaCore and ownMeter');
  eq(sh && sh.bessKwh, 61.44, 'and its battery');
  P._derDcId = 'dc_triton'; vm.runInContext('_derPlaceDcPad({x:0,y:0})', P);
  ok(!P.S.shapes[1].omegaCore, 'an ordinary pod does not');

  /* the host's load never includes the skid */
  var L = { S: { shapes: [sh, P.S.shapes[1]], elements: [] }, DERC_DC: P.DERC_DC, _eqRole: function () { return null; } };
  vm.createContext(L);
  vm.runInContext(bodyFrom(ED, 'function derTotals(st){'), L);
  vm.runInContext(bodyFrom(ED, 'function omegaDer(){'), L);
  var t = vm.runInContext('derTotals()', L), od = vm.runInContext('omegaDer()', L);
  eq(t.dcLoadKw, 120, 'derTotals: only the pod is host load');
  eq(t.ocUnits + '/' + t.ocKw + '/' + t.ocBessKwh, '1/75/61.44', 'derTotals counts the skid as itself');
  eq(od.dcLoadKw, 120, 'omegaDer: the skid is not in the site load');
  eq(od.ocUnits, 1, 'omegaDer counts it as Omega-Core');

  /* every reader of host compute, cost and site type skips it */
  [['the data-centre electrical ROM', 'function omegaDataCenterROM(', /sh\.omegaCore/],
   ['the one-line export', 'function omegaOneLineExport(', /sh\.omegaCore\) return;/],
   ['the BOM (its own line, not a pod)', 'function buildBOM(', /Omega-Core skid \(Solela Edge Compute \+ CleanCell R60\)/],
   ['the spec sheet (its own row)', 'function exportSpecSheet(', /Omega-Core skid \\u00d7/],
   ['the proposal type', 'function _proposalTypeFromDrawing(', /sh\.kind==='derdc' && !sh\.omegaCore/],
   ['the Results rail (its own row)', 'function omegaRenderResults(', /'Omega-Core'\+unitSfx/]
  ].forEach(function (c) { var b = ''; try { b = bodyFrom(ED, c[1]); } catch (e) {} ok(c[2].test(b), c[0] + ' keeps the skid off the host', c[1]); });
  var pods = ED.slice(ED.indexOf('  function pods() {\n    var n = 0, kw = 0;'), ED.indexOf('  function pods() {\n    var n = 0, kw = 0;') + 400);
  ok(/sh\.omegaCore\) return;/.test(pods), 'OmegaComputeCost.pods: a skid is never priced as a $30k/kW pod');
  ok(/if \(!sh \|\| sh\.kind !== 'derdc' \|\| sh\.omegaCore\) return;   \/\* not the host's compute \*\//.test(ED), 'OmegaRecord.podsOnDrawing skips it');
  ok(/if \(k === 'derdc' && sh\.omegaCore\) return null;/.test(ED), 'the supply links do not treat it as a load');
  ok(/add\('omegacore', '\\u25a6', 'Omega-Core skid \(own meter\)', sh\.kw, sh\.bessKwh\)/.test(ED), 'the legend gives it its own row with its kWh');
  ok(/case 'derdc':\s*\n\s*\/\* Omega-Core is its own row/.test(ED), 'and so does the campus census');
  ok(/if\(_r && DERC_DC\[_r\] && !DERC_DC\[_r\]\.omegaCore\)/.test(ED), 'a palette element of it is not host load either');

  /* the Output button, its owner, its icon, its module */
  ok(/<button class="rbtn" id="rb-omega-core" onclick="rbRun\(openOmegaCore\)" data-cap="compute"/.test(ED), 'Output › Omega-Core, on the compute cap');
  ok(/<span class="rb-lbl">Omega-Core<\/span>/.test(ED), 'labelled Omega-Core');
  ok(/function openOmegaCore\(\)\{\s*if \(window\.OmegaCoreQualify/.test(ED), 'the opener is a plain global (guardLaunchers wraps it)');
  var iCL = ED.indexOf('<script src="/omega-compute-lease.js"></script>'), iOC = ED.indexOf('<script src="/omega-core-qualify.js"></script>');
  ok(iCL > 0 && iOC > iCL, 'the module loads after the lookup client it uses');
  var M = require('../../api/_lib/modules');
  eq(M.owners('rb-omega-core', 'rbRun(openOmegaCore)').join(','), 'compute', 'Omega Compute owns the button, as it owns derSetDc');
  ok((M.get('compute').legacyGates || []).indexOf('compute') >= 0, 'and its legacy gate already carries the compute cap');
  var icons = require('../../omega-ribbon-icons.js');
  ok(icons.pathFor('Omega-Core', 'Omega-Core') !== icons.FALLBACK, 'the button has its own icon');
  var mod = fs.readFileSync(path.join(ROOT, 'omega-core-qualify.js'), 'utf8');
  ok(!/=>|\bconst\b|\blet\b|`/.test(mod), 'the module is ES5');
  ok(/© 2025–2026 ClearSky Energy Solutions LLC/.test(mod), 'and carries the header');
  ok(!/450000|450,000|monthlyPerSkid\s*:\s*\{|fmvAtYear5/.test(mod), 'no price, lease card or buyout band in the browser');
  ok(/OmegaComputeLease/.test(mod) && /\.evidence\(/.test(mod), 'it fans out through OmegaComputeLease.evidence, not a second copy');

  /* the project field, saved and restored */
  var save = bodyFrom(ED, 'async function saveProject(');
  ok(/^\s*omegaCore:\s+S\.omegaCore\s+\|\| null,/m.test(save), 'S.omegaCore is in the save payload literal');
  ok(/S\.omegaCore\s+= \(d\.omegaCore\s+&& typeof d\.omegaCore==='object'\)/.test(bodyFrom(ED, 'async function _loadProject(')), 'and restored on load');

  /* the CleanCell R60 */
  var bc = ED.slice(ED.indexOf('const BESS_CATALOG = {'), ED.indexOf('/* ── THE TENANT\'S OWN PRODUCTS LEAD'));
  var R = vm.runInNewContext('(' + bc.slice(bc.indexOf('{'), bc.lastIndexOf('}') + 1) + ')')['CC-R60'];
  ok(R && R.kwh === 61.44 && R.kw === 60 && R.acCurrent === 72.3, 'BESS_CATALOG CC-R60: 61.44 kWh, 60 kW, 72.3 A');
  ok(R && R._incPCS === true && R.xfmr === 'N/A' && R.evSkid === true, 'its PCS is integrated, no transformer, and it is an EV skid');
  eq(R && R.usable, null, 'usable kWh is unpublished and stays null');
  ok(R && /Rev A/.test(R.verified), 'it cites the datasheet');
  ok(/'CC-R60':\s*\{ l:'28\\'-0"',\s*w:'7\\'-3"'.*lf:28\.0, wf:7\.25/.test(ED), 'its 336 x 87 in skid is on the BESS Pad list');
  ok(/<option value="CC-R60">/.test(ED), 'and in BESS Config');
  ok(/_setChk\('inc-pcs',  m\._incPCS  != null \? m\._incPCS  : _big\);/.test(ED), 'the catalog\'s own word on its PCS wins over the size rule');
  ok((ED.match(/&& !p\.evSkid\)/g) || []).length === 2, 'the auto-sizer never recommends an EV skid');
}

/* ═══ 4 · the client's collect() ═══════════════════════════════════════ */
function clientChecks() {
  var W = {
    S: { shapes: [{ kind: 'derdc', omegaCore: true }, { kind: 'derdc' }, { kind: 'evunit' }],
         costRollup: { capex: 900000, netCost: 800000, incentive: 100000, annualRevenue: 150000, at: 1759300000000 },
         resultsStale: false, omegaFiber: { nearestRoute: { distanceM: 800 } } },
    _projectId: 'p1', _COST_LOW: 800000, _COST_HIGH: 1100000, _EV_TOTAL: 500000,
    _npxSiteLatLon: function () { return { lat: 40.5, lon: -74.4 }; },
    evChargerTotals: function () { return { dcfcKw: 480, dcfcUnits: 2, l2Kw: 0, l2Units: 0, ports: 4 }; },
    omegaDcLoadKw: function () { return 120; },
    _SITE_DATA: { parcelZoning: 'C-2' },
    localStorage: { getItem: function () { return JSON.stringify({ activeId: 'a', scenarios: { a: { data: { p0_service_amps: '800', p0_service_v: '480', p0_xfmr_kva: '1000' } } } }); } }
  };
  W.window = W;
  var docEls = { 'addr-in': { value: '9 Oak Ave' }, pname: { value: 'Oak Charging' } };
  W.document = { getElementById: function (id) { return docEls[id] || null; } };
  vm.createContext(W);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'omega-core-qualify.js'), 'utf8'), W);
  var f = W.OmegaCoreQualify.collect();
  eq(f.drawing.units, 1, 'collect: one skid on the drawing (the pod is not one)');
  eq(f.drawing.chargers.dcfcUnits, 2, 'collect: the chargers');
  eq(f.drawing.dcLoadKw, 120, 'collect: the host\'s own compute');
  eq(f.drawing.xfmrKva, 1000, 'collect: the transformer from the site intake');
  eq(f.drawing.service.amps, 800, 'collect: the host service from the intake');
  eq(f.run.capex, 900000, 'collect: the Run\'s capex');
  eq(f.run.lines.ev, 500000, 'collect: the cost sheet\'s own lines');
  eq(f.site.lat, 40.5, 'collect: the site point');
  eq(f.site.address, '9 Oak Ave', 'collect: the address');
  eq(f.parcelZoning, 'C-2', 'collect: the parcel zoning to prefill');
  eq(f.fiberOnFile.nearestRoute.distanceM, 800, 'collect: the fiber on file');
  /* and the server takes exactly that shape */
  var back = OC.evaluate({ site: f.site, drawing: f.drawing, run: f.run, evidence: { fiberOnFile: f.fiberOnFile }, rep: {} }, {});
  eq(back.host.run.capex, 900000, 'the server reads the collected Run');
  eq(back.gates.power.headroomSource, 'drawing', 'and the collected transformer');
}

(function main() {
  var chain = Promise.resolve();
  doorChecks.forEach(function (fn) { chain = chain.then(fn); });
  chain.then(function () { editorChecks(); clientChecks(); })
    .then(function () {
      console.log('omega-core: ' + pass + ' passed, ' + fail + ' failed');
      if (fail) process.exitCode = 1;
    }, function (e) { console.error(e); process.exitCode = 1; });
})();
