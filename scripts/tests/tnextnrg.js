#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   NextNRG Microgrids in the system (Tommy, 2026-10-13): their solar module
   is what Draw › Power Gen › Solar draws with, their storage is a labelled
   group in the battery catalog, their Microgrid Controller is under Draw ›
   Utility at $125,000 a unit on the Run and is built into every Omega-Core
   skid, and a site that has one earns the brochure's modelled dispatch
   uplift (7%) in the Value Stack — on the server, with its caveat.

   Held here, each failing when its piece is removed:
     1 · the record (api/_lib/nextnrg.js): the figures off the brochure,
         the price, the uplift rule and what it touches
     2 · the cost engine: a controller on the host's drawing is a line
     3 · the dispatch: the uplift on bill savings only, said on each stream
     4 · the value-stack door passes the flag in and the summary out
     5 · the editor: the catalogs carry the SAME figures as the record, the
         flyout, the skid, the module as the default, the counts, the Run's
         row, the BOM lines, the Value Stack's flag — and NO PRICE
     6 · the vendor: NextNRG's brand on the tenant record, for the RFQ

     node scripts/tests/tnextnrg.js */
'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm');
var ROOT = path.join(__dirname, '..', '..');
var ED = fs.readFileSync(path.join(ROOT, 'editor.html'), 'utf8');
var pass = 0, fail = 0;
function ok(c, l, x) { if (c) pass++; else { fail++; console.error('  FAIL  ' + l + (x != null ? '\n        ' + x : '')); } }
function eq(got, want, l) { ok(got === want, l, 'got ' + JSON.stringify(got) + ', want ' + JSON.stringify(want)); }
function near(got, want, tol, l) { ok(got != null && Math.abs(got - want) <= tol, l, 'got ' + got + ', want ' + want + ' ±' + tol); }
function bodyFrom(src, needle) {
  var at = src.indexOf(needle);
  if (at < 0 || src.indexOf(needle, at + 1) >= 0) throw new Error(needle + ' must appear exactly once');
  var k = src.indexOf('{', at), d = 0;
  for (;; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (!d) break; } }
  return src.slice(at, k + 1);
}

/* ═══ 1 · the record ══════════════════════════════════════════════════ */
var NN = require('../../api/_lib/nextnrg');
eq(NN.SOLAR_MODULE.watts, 640, 'the module: JinkoSolar EAGLE G7B, 640 W (brochure p. 3-4)');
eq(NN.SOLAR_MODULE.efficiencyPct, 23.69, '23.69% efficiency');
eq(NN.SOLAR_MODULE.heightMm + 'x' + NN.SOLAR_MODULE.widthMm + 'x' + NN.SOLAR_MODULE.depthMm, '2382x1134x30', '2382 × 1134 × 30 mm');
eq(NN.SOLAR_MODULE.weightLb, 71.4, '71.4 lb');
eq(NN.SOLAR_MODULE.performanceWarranty.years + '/' + NN.SOLAR_MODULE.performanceWarranty.outputAtYear30Pct, '30/87.4', 'a 30-year linear warranty at or above 87.4%');
near(NN.moduleWpsf(), 22.01, 0.01, 'its density is the nameplate over the frame: 22.0 W/ft²');
eq(NN.SOLAR_MODULE.wpsf, 22.01, 'and the record carries it rounded');
eq(NN.STORAGE_SPEC.durationHours.join('-'), '2-8', 'storage: 2 to 8 hours (p. 5-6)');
eq(NN.STORAGE_SPEC.roundTripEfficiencyAcPct.join('-'), '85-90', '85 to 90% AC round trip');
eq(NN.STORAGE_SPEC.designLifeYears + '/' + NN.STORAGE_SPEC.dailyThroughputPct, '20/300', '20-year design life, 300% daily throughput');
ok(/UL 1973/.test(NN.STORAGE_SPEC.standards) && /NFPA 855/.test(NN.STORAGE_SPEC.fireCode) && /IP54/.test(NN.STORAGE_SPEC.ingress), 'UL 1973, NFPA 855, IP54');
eq(NN.STORAGE.length, 4, 'four storage entries: ONLY the blocks the brochure names on its specification page (Tommy: "off of that spec sheet")');
eq(NN.STORAGE.map(function (s) { return s.kwh; }).join(','), '3400,4300,5100,2500', '3.4 / 4.3 / 5.1 MWh Intensium Flex and the 2.5 MWh Intensium Max 20 HE');
ok(NN.STORAGE.every(function (s) { return s.mfr === 'NextNRG'; }), 'every one labelled NextNRG');
ok(NN.STORAGE.every(function (s) { return s.kw === null && s.dur === null && /not published/.test(s.kwNote); }), 'no kW the sheet does not publish: the PCS is sized per site');
ok(!NN.STORAGE.some(function (s) { return s.placeholder || /specified per site/.test(s.model); }), 'no invented catalogue product (the C&I route enters through NextNRG\'s own product list)');
ok(/own product list/.test(NN.STORAGE_SPEC.scaleNote), 'and the record says where the rest comes from');
eq(NN.CONTROLLER.priceUsd, 125000, 'the controller is $125,000 a unit (Tommy, 2026-10-13)');
eq(NN.CONTROLLER.key, 'NEXTNRG-MGC', 'under its catalogue key');
eq(NN.CONTROLLER.dispatchIntervalMin + '/' + NN.CONTROLLER.horizonHours, '15/24', '15-minute dispatch on a 24-hour horizon (p. 7-8)');
eq(NN.CONTROLLER.widthMm + 'x' + NN.CONTROLLER.heightMm + 'x' + NN.CONTROLLER.depthMm, '500x750x210', '500 × 750 × 210 mm');
eq(NN.CONTROLLER.weightKg + '/' + NN.CONTROLLER.ingress + '/' + NN.CONTROLLER.ethernetPorts, '40/IP55/10', '40 kg, IP55, ten Ethernet ports');
eq(NN.CONTROLLER.modes.join(','), 'economic,resilience,islanded', 'three modes');
ok(/10,326,280/.test(NN.CONTROLLER.patent) && /IEC 62443/.test(NN.CONTROLLER.standards), 'the patent and the cybersecurity standard are on the record');
/* THE SYSTEM RATE (2026-10-14, Tommy: "the cost of the nextnrg bess and the
   next nrg solar is $6.00 per watt"): one record, read by the cost engine;
   the page sends which arrays and batteries are NextNRG's and never the rate */
eq(NN.SYSTEM_RATE.perWdc, 6, 'NextNRG solar + storage is $6.00 per W-DC of solar, installed, the storage and the labor inside');
eq(NN.SYSTEM_RATE.storageOnlyPerW, 6, 'NextNRG storage alone is $6.00 per W of rated power, installed');
ok(NN.SYSTEM_RATE.includes.join(',') === 'the solar array,the storage beside it,installation labor' && NN.SYSTEM_RATE.contingency === false, 'what the price includes, and no contingency on a vendor\'s installed price');
ok(/\$1,780,063/.test(NN.SYSTEM_RATE.corroboration) && /\$5\.65\/W DC/.test(NN.SYSTEM_RATE.corroboration), 'corroborated by NextNRG\'s own Topanga one-pager ($5.65/W DC for 315 kW DC + 300 kW / 1.8 MWh)');
ok(NN.isVendorOrg('nextnrg.com') && NN.isVendorOrg('NextNRG.com') && !NN.isVendorOrg('clearsky-usa.com') && !NN.isVendorOrg(null), 'NextNRG\'s own workspace is the vendor\'s');
ok(NN.isNextnrgSolar({ sku: 'NEXTNRG-PV-EAGLE-G7B' }) && NN.isNextnrgSolar({ mfr: 'NextNRG' }) && NN.isNextnrgSolar({ nextnrg: true }) && !NN.isNextnrgSolar({ mfr: 'Jinko' }) && !NN.isNextnrgSolar(null), 'an array is NextNRG\'s by its stamp');
var EC = require(path.join(ROOT, 'api/_lib/editor-cost'));
ok(EC.NN_RATE === NN.SYSTEM_RATE, 'the cost engine reads the one record');
var ws = EC.rollup({ vendorOrg: 'nextnrg.com', solarKwDc: 368, solar: { byMount: { roof: 368 } }, fleet: { units: 1, byModel: { 'X': { qty: 1, kwh: 1000, kw: 250, cost: null } } }, counts: {}, sheet: {} });
eq(ws.lines.nextnrg.total, 2208000, 'Topanga: 368 kW-DC at $6.00/W is $2,208,000 in NextNRG\'s own workspace');
ok(ws.lines.nextnrg.storage.inside && ws.lines.bess.rows[0].inSystem && ws.lines.bess.total === 0 && ws.lines.solar.rows.length === 0, 'the 250 kW / 1,000 kWh battery beside it is inside the price, not priced again');
eq(ws.totals.total, 2208000, 'and no contingency rides on it'); eq(ws.totals.itcBasis, 2208000, 'it is energy property');
var st = EC.rollup({ solarKwDc: 500, solar: { byMount: { ground: 132 }, nextnrgKwDc: 368 }, fleet: { units: 2, byModel: { 'NEXTNRG-SAFT-IFLEX-3400': { qty: 1, kwh: 3400, kw: 1000, cost: null, nextnrg: true }, 'GOTION-EDGE-760': { qty: 1, kwh: 760, kw: 380, cost: null, catalogKey: 'GOTION-EDGE-760' } } }, counts: {}, sheet: {} });
ok(st.lines.nextnrg.total === 2208000 && st.lines.nextnrg.vendor === 'product' && st.lines.solar.rows[0].mount === 'ground' && st.lines.solar.rows[0].kwDc === 132, 'in another workspace, only the array stamped NextNRG\'s is the system; the rest is priced by mount');
ok(st.lines.bess.rows[0].inSystem && st.lines.bess.rows[0].total === 0 && !st.lines.bess.rows[1].inSystem && st.lines.bess.rows[1].total === Math.round(84740 * 1.55), 'NextNRG\'s battery is inside the system; a Gotion beside it keeps its own price');
ok(Math.abs(st.totals.cont - (st.totals.sub - 2208000) * 0.1) < 1e-6, 'contingency on everything but the vendor\'s installed price');
var alone = EC.rollup({ fleet: { units: 1, byModel: { 'NEXTNRG-SAFT-IFLEX-3400': { qty: 1, kwh: 3400, kw: 1000, cost: null, nextnrg: true } } }, counts: {}, sheet: {} });
ok(alone.lines.nextnrg.storage.total === 6000000 && alone.lines.bess.rows[0].nextnrgRate && alone.totals.total === 6000000 && alone.totals.cont === 0, 'NextNRG storage with no NextNRG solar beside it: $6.00 per W of rated power, installed, no contingency');
var typed = EC.rollup({ vendorOrg: 'nextnrg.com', solarKwDc: 100, solar: { byMount: { roof: 100 } }, fleet: { units: 1, byModel: { 'X': { qty: 1, kwh: 500, kw: 250, cost: 90000 } } }, counts: {}, sheet: {} });
ok(typed.lines.bess.rows[0].total === Math.round(90000 * 1.55) && !typed.lines.bess.rows[0].inSystem, 'a battery whose price was typed keeps it');
ok(/q\.vendorOrg = caller\.orgId \|\| null;/.test(fs.readFileSync(path.join(ROOT, 'api/cost-rollup.js'), 'utf8')), 'the endpoint stamps whose workspace is pricing; the body never says');
ok(/nextnrgKwDc:\(typeof omegaSolarNextnrgKwDc==='function'\)/.test(ED) && /nextnrg: !!\(\(ce && \(ce\.nextnrg===true \|\| String\(ce\.mfr\|\|''\)\.toLowerCase\(\)==='nextnrg'\)\) \|\| String\(b\.mfr\|\|''\)\.toLowerCase\(\)==='nextnrg' \|\| \/\^nextnrg\\b\/i\.test\(String\(k\)\)\)/.test(ED), 'the page sends which arrays and batteries are NextNRG\'s, as facts');
ok(/function omegaSolarIsNextnrg\(s\)/.test(ED) && /if\(typeof omegaSolarIsNextnrg==='function' && omegaSolarIsNextnrg\(s\)\) return;/.test(bodyFrom(ED, 'function omegaSolarByMount(')), 'a NextNRG array is kept out of the mount bands');
ok(/NNL\.label\+' \\u2014 '\+Math\.round\(NNL\.solarKwDc\)/.test(ED) && /window\._NEXTNRG_SYSTEM_TOTAL = T\.nextnrg \|\| 0;/.test(ED), 'the cost sheet draws the system line and publishes its total');
ok(!/6\.00|perWdc/.test(bodyFrom(ED, 'function omegaCostQuantities(')), 'no rate in the page\'s request');
eq(NN.UPLIFT.pct, 0.07, 'the uplift is 7% (the brochure\'s 6 to 8%, carried as the platform\'s 7%)');
eq(NN.UPLIFT.rangePct.join('-'), '0.06-0.08', 'with its published range');
eq(NN.UPLIFT.appliesTo, 'bill', 'on the dispatch-decided bill savings only');
ok(/not a performance guarantee/.test(NN.UPLIFT.caveat) && /Modelled rather than measured/.test(NN.UPLIFT.caveat), 'and the brochure\'s own caveat');
var st = [{ id: 'bill.demand', category: 'bill', counted: true, usd: 10000, how: 'x' }, { id: 'bill.tou', category: 'bill', counted: true, usd: 2000, how: 'y' },
          { id: 'pjm.capacity', category: 'grid', counted: true, usd: 5000, how: 'z' }, { id: 'dead', category: 'bill', counted: false, usd: 900 }];
var up = NN.applyUplift(st);
eq(st[0].usd + '/' + st[1].usd + '/' + st[2].usd + '/' + st[3].usd, '10700/2140/5000/900', 'applied: bill streams +7%, a programme stream untouched, an uncounted stream untouched');
eq(up.usdPerYear, 840, 'the summary adds up what moved');
eq(up.streams.join(','), 'bill.demand,bill.tou', 'and names the streams');
eq(up.pct, 7, 'as a whole percent');
ok(/\+7% \(\$700\)/.test(st[0].how) && /modelled, not measured/.test(st[0].how), 'each touched stream says so in its own working');
ok(st[2].controller == null && st[0].controller && st[0].controller.usd === 700, 'the mark rides only on what moved');
ok(NN.wantsController(true) && NN.wantsController('NEXTNRG-MGC') && NN.wantsController('nextnrg') && !NN.wantsController(false) && !NN.wantsController('') && !NN.wantsController('gotion'), 'the flag: true, the key, or the brand');

/* ═══ 2 · the cost engine ═════════════════════════════════════════════ */
var EC = require('../../api/_lib/editor-cost');
var r1 = EC.rollup({ counts: { mgc: 1 } });
eq(r1.lines.controller.total, 125000, 'one controller on the host\'s drawing: $125,000');
eq(r1.lines.controller.model, 'NextNRG Microgrid Controller', 'under NextNRG\'s name');
eq(r1.totals.total, 137500, 'in the total, with the 10% contingency');
eq(r1.totals.inScope, true, 'a controller alone is in scope');
eq(r1.totals.controller + '/' + r1.totals.controllerUnits, '125000/1', 'published on the totals');
eq(r1.totals.itcBasis, 137500, 'energy-property controls stay in the ITC basis');
eq(EC.rollup({ counts: { mgc: 3 } }).lines.controller.total, 375000, 'three: $375,000');
var r0 = EC.rollup({ counts: { pad: 1 }, fleet: { units: 1, byModel: { 'GOTION-EDGE-760': { qty: 1, kwh: 760, kw: 380 } } } });
eq(r0.lines.controller.qty + '/' + r0.totals.controller, '0/0', 'none placed: nothing added');
eq(r0.totals.total, Math.round((84740 * 1.55 + 4800) * 1.1 * 100) / 100, 'and the rest of the sheet is as it was');
ok(r1.lines.controller.uplift.pct === 7 && /not a performance guarantee/.test(r1.lines.controller.uplift.caveat), 'the line carries the uplift it entitles, with the caveat');

/* ═══ 3 · the dispatch ════════════════════════════════════════════════ */
var SIM = require('../../api/_lib/vpp-sim');
var base = SIM.simulate({ zip: '60601', battery: { kw: 500, kwh: 2000 }, solarKw: 300 });
var withC = SIM.simulate({ zip: '60601', battery: { kw: 500, kwh: 2000 }, solarKw: 300, controller: 'NEXTNRG-MGC' });
ok(base.ok && withC.ok, 'both simulations run');
eq(base.controller, null, 'without a controller the result says none');
ok(withC.controller && withC.controller.key === 'NEXTNRG-MGC' && withC.controller.pct === 7, 'with one, the summary is on the result');
function s(r, id) { for (var i = 0; i < r.streams.length; i++) if (r.streams[i].id === id) return r.streams[i]; return null; }
['bill.demand', 'bill.tou'].forEach(function (id) {
  var a = s(base, id), b = s(withC, id);
  if (!a || !(a.usd > 0)) return;
  eq(b.usd, a.usd + Math.round(a.usd * 0.07), id + ': exactly 7% more');
});
base.streams.forEach(function (a) {
  if (a.category === 'bill') return;
  var b = s(withC, a.id);
  ok(b && b.usd === a.usd, a.id + ': a programme stream is not uplifted');
});
eq(withC.totals.gross - base.totals.gross, withC.controller.usdPerYear, 'the gross moves by exactly the uplift');
ok(/not a performance guarantee/.test(withC.controller.caveat), 'the caveat travels');
eq(SIM.simulate({ zip: '60601', battery: { kw: 500, kwh: 2000 }, controller: 'gotion' }).controller, null, 'a string that is not the controller earns nothing');

/* ═══ 4 · the door ════════════════════════════════════════════════════ */
var VA = fs.readFileSync(path.join(ROOT, 'api', 'value-stack.js'), 'utf8');
ok(/controller: body\.controller === true \|\| typeof body\.controller === 'string' \? body\.controller : null/.test(VA), 'POST /api/value-stack passes the controller flag into the simulation');
ok(/controller: sim\.controller \|\| null,/.test(VA), 'and the summary out, key by key');
ok(!/0\.07|125000/.test(VA), 'the door carries neither the rate nor the price');

/* ═══ 5 · the editor ══════════════════════════════════════════════════ */
/* the battery catalog carries the record's figures, labelled NextNRG */
var bc = ED.slice(ED.indexOf('const BESS_CATALOG = {'), ED.indexOf('/* ── THE TENANT\'S OWN PRODUCTS LEAD'));
var CAT = vm.runInNewContext('(' + bc.slice(bc.indexOf('{'), bc.lastIndexOf('}') + 1) + ')');
NN.STORAGE.forEach(function (p) {
  var e = CAT[p.key];
  ok(e, 'BESS_CATALOG has ' + p.key);
  if (!e) return;
  eq(e.mfr, 'NextNRG', p.key + ' is labelled NextNRG');
  eq(e.kwh, p.kwh, p.key + ': the server\'s kWh');
  eq(e.kw, null, p.key + ': no kW the sheet does not publish');
  ok(/Power is NOT published per block/.test(e.notes), p.key + ': and the note says so');
  eq(e.eqcost, null, p.key + ': no price in the browser');
  ok(!/\$\s?\d|price:|\d{3},\d{3}/.test(JSON.stringify(e).replace(/PRICE: quote required/, '')), p.key + ': no figure that is a price');
  ok(/UL 1973/.test(e.certs) && /NFPA 855/.test(e.certs), p.key + ': the requirement\'s standards');
  ok(/NextNRG Microgrids brochure/.test(e.verified), p.key + ': cites the brochure');
  ok(new RegExp('<option value="' + p.key + '">').test(ED), p.key + ' is in BESS Config');
  if (p.kwh) ok(new RegExp("'" + p.key + "':\\s*\\{[^\\n]*lf:19\\.875, wf:8\\.0").test(ED), p.key + ' has a 20 ft footprint on the BESS Pad list');
});
ok(/<optgroup label="NextNRG Microgrids \(storage specified to the site\)">/.test(ED), 'their own group in the dropdown');
ok(!CAT['NEXTNRG-CI-SPEC'] && !/NEXTNRG-CI-SPEC/.test(ED), 'no invented NextNRG product in the page either');
eq(Object.keys(CAT).filter(function (k) { return CAT[k].mfr === 'NextNRG'; }).length, 4, 'exactly the four blocks wear the NextNRG name in the shipped catalog; anything else is their own library');

/* the controller under Draw › Utility, specs only */
var uc = vm.runInNewContext(bodyFrom(ED, 'var UTILITY_CATALOG = {').replace(/^var /, '(').replace(/\}$/, '})'));
ok(uc.mgc && uc.mgc.abbr === 'MGC' && uc.mgc.sku === NN.CONTROLLER.key && uc.mgc.mfr === 'NextNRG', 'UTILITY_CATALOG.mgc: NextNRG\'s controller under its key');
eq(uc.mgc.lf + 'x' + uc.mgc.wf, NN.CONTROLLER.padLf + 'x' + NN.CONTROLLER.padWf, 'its pad footprint is the record\'s');
ok(/500 x 750 x 210 mm/.test(uc.mgc.spec) && /IP55/.test(uc.mgc.spec) && /15-minute dispatch/.test(uc.mgc.spec), 'with the brochure\'s specs');
ok(!/125/.test(JSON.stringify(uc.mgc)), 'and no price');
/* the long Utility list is built at install from the BOP catalog's MENU; the
   controller is first in its Controls group, drawn off the one catalog row */
ok(/\['Controls', \[\['mgc', '◧'\], \['ems', '▤'\], \['scada', '▥'\]\]\],/.test(ED), 'Draw › Utility lists NextNRG Microgrid Controller first under Controls (Tommy: "where is nextnrg\'s microcontroller box in this list?")');
ok(/def = UTILITY_CATALOG\[key\] \|\| BOP\[key\];/.test(ED), 'and the row is UTILITY_CATALOG\'s (NextNRG\'s label and footprint), never a second definition');
ok(/mgc: \{ label: 'NEXTNRG MICROGRID CONTROLLER', lf: 2\.5, wf: 1\.75, abbr: 'MGC' \},/.test(ED), 'the BOP list carries the same key with the same figures');
ok(!/setUtilityType\('mgc'\)\}\)"/.test(ED), 'and there is no second, static entry at the top of the list');
ok(/UTILITY_CATALOG\.mgc\)\|\|\{label:'MICROGRID CONTROLLER'/.test(bodyFrom(ED, 'function mgcAsset(nearX, nearY)')), 'the guided build places the same catalog row');

/* built into the Omega-Core skid */
var sb = vm.createContext({});
vm.runInContext(ED.slice(ED.indexOf('var DC_CATALOG = {'), ED.indexOf('/* END ZTMM PLANNER */')) + ';this.DC=DC_CATALOG;', sb);
eq(sb.DC.dc_omegacore.controllerKey, 'NEXTNRG-MGC', 'DC_CATALOG.dc_omegacore carries the controller');
ok(/NextNRG Microgrid Controller/.test(sb.DC.dc_omegacore.spec), 'in its spec');
ok(/out\[k\]\.controller = c\.controller; out\[k\]\.controllerKey = c\.controllerKey;/.test(ED), 'the placement catalog copies it');
ok(/sh\.controller=_oc\.controller; sh\.controllerKey=_oc\.controllerKey;/.test(bodyFrom(ED, 'function _derPlaceDcPad(p){')), 'a placed skid remembers it');
ok(/'MGC', Math\.max\(5,Math\.min\(8,ppf\*0\.4\)\), '#166534'/.test(bodyFrom(ED, 'function _derRenderDc(g, sh){')), 'and the drawing shows it on the skid');
ok(/Omega-Core skid \(Solela Edge Compute \+ CleanCell R60 \+ NextNRG Microgrid Controller\)/.test(bodyFrom(ED, 'function buildBOM(')), 'the BOM names it in the skid\'s line');
ok(/CleanCell R60 \(Sol-Ark 60K\) \+ NextNRG Microgrid Controller on one 336/.test(bodyFrom(ED, 'function exportSpecSheet(')), 'so does the spec sheet');
var OC = require('../../api/_lib/omega-core');
eq(OC.PRODUCT.controller.catalogKey, sb.DC.dc_omegacore.controllerKey, 'the server\'s skid and the page\'s skid name the same controller');

/* the module: NextNRG's specification is what Solar draws with */
var mb = ED.slice(ED.indexOf('var DER_PV_MODULES = {'), ED.indexOf('\n', ED.indexOf('var DER_PV_WPSF = ')) + 1);
var mctx = vm.createContext({});
vm.runInContext(mb + ';this.M=DER_PV_MODULES;this.D=DER_PV_MODULE_DEFAULT;this.W=DER_PV_WPSF;this.watts=_pvModuleWatts();this.f=_pvModuleWpsf;', mctx);
eq(mctx.D, 'nextnrg-eagle-g7b', 'the default module is NextNRG\'s EAGLE G7B');
var M = mctx.M[mctx.D];
eq(M.watts, NN.SOLAR_MODULE.watts, 'its watts are the record\'s');
eq(M.effPct, NN.SOLAR_MODULE.efficiencyPct, 'its efficiency too');
eq(M.widthMm + 'x' + M.heightMm + 'x' + M.depthMm, NN.SOLAR_MODULE.widthMm + 'x' + NN.SOLAR_MODULE.heightMm + 'x' + NN.SOLAR_MODULE.depthMm, 'and its frame');
eq(M.mfr + '/' + M.sku, 'NextNRG/NEXTNRG-PV-EAGLE-G7B', 'labelled NextNRG, under a catalogue key');
eq(mctx.W, NN.SOLAR_MODULE.wpsf, 'DER_PV_WPSF is the module\'s own density, not a rule of thumb');
eq(mctx.watts, 640, 'the string sizer\'s default module watts');
near(mctx.f(mctx.M['generic-550']), 19.8, 0.1, 'the former 550 W planning default stays as a choice, at about 20 W/ft²');
ok(!/\$|price/i.test(JSON.stringify(mctx.M)), 'no price on a module');
var sa = bodyFrom(ED, 'function _solarAssume(mount){');
ok(/out\.moduleKey = mk; out\.module = DER_PV_MODULES\[mk\];/.test(sa) && /out\.wpsf = Math\.round\(_pvModuleWpsf\(out\.module\)\*100\)\/100;/.test(sa), 'the module decides the density unless one is typed');
ok(/if\(field==='moduleKey'\)\{/.test(bodyFrom(ED, 'function setSolarAssume(field, val){')), 'the module is a saved assumption');
ok(/setSolarAssume\(\\'moduleKey\\',this\.value\)/.test(ED), 'and a choice on the Solar Assumptions panel');
ok(/num\(cfg\.moduleWatts, \(typeof _pvModuleWatts==='function'\) \? _pvModuleWatts\(\) : 550\)/.test(ED), 'the string sizer reads the module\'s watts');
ok(/MOD_W_FT=_m3\.widthMm\/304\.8; MOD_H_FT=_m3\.heightMm\/304\.8;/.test(ED), 'the 3D module pattern is the module\'s frame');
ok(/\(_pvm&&_pvm\.sku\)\|\|'', \(_pvm&&_pvm\.mfr\)\|\|''\);/.test(bodyFrom(ED, 'function buildBOM(')), 'the BOM\'s solar line carries the module\'s key and brand');

/* the host's count, the Run's row, the BOM line, the Value Stack flag */
var cq = bodyFrom(ED, 'function omegaCostQuantities(){');
ok(/q\.counts\.mgc=\(S\.shapes\|\|\[\]\)\.filter\(function\(sh\)\{ return sh && sh\.kind==='utility' && sh\.utype==='mgc'; \}\)\.length;/.test(cq), 'the quantities count the controllers placed for the host — utility shapes only, never the skid\'s');
ok(/T\.controller > 0 \? row\('  NextNRG Microgrid Controller \\u00d7' \+ T\.controllerUnits, T\.controller/.test(ED), 'the Run shows the row');
ok(/window\._MGC_TOTAL = T\.controller \|\| 0;/.test(ED) && /'_MGC_TOTAL','_NEXTNRG_SYSTEM_TOTAL','_COST_PER_KW'/.test(ED), 'published and reset with the other totals');
var bom = bodyFrom(ED, 'function buildBOM(');
ok(/else if\(sh\.kind==='utility' && sh\.utype==='mgc'\)\{ _cs\.mgc\+\+; \}/.test(bom) && /_mcat\.sku\|\|'NEXTNRG-MGC', _mcat\.mfr\|\|'NextNRG'\);/.test(bom), 'the BOM lists it with its key and brand, for the RFQ');
var vp = ED.slice(ED.indexOf('OMEGA PATCH — 41 : VALUE STACK'), ED.indexOf('OMEGA PATCH — 42'));
ok(/function controllerOnDrawing\(\)/.test(vp) && /sh\.kind === 'utility' && sh\.utype === 'mgc'\) key = 'NEXTNRG-MGC'/.test(vp), 'the Value Stack reads a controller off the drawing');
ok(/var mgc = controllerOnDrawing\(\); if \(mgc\) req\.controller = mgc;/.test(vp), 'and sends it');
ok(/R\.controller \? '<div/.test(vp) && /esc\(R\.controller\.caveat\)/.test(vp), 'and shows the server\'s summary with its caveat');
ok(!/0\.07|7%|125000|125,000/.test(vp), 'the panel carries neither the rate nor the price');
/* no price anywhere the page names NextNRG */
var nnRegions = [bc.slice(bc.indexOf('NEXTNRG MICROGRIDS')), bodyFrom(ED, 'var UTILITY_CATALOG = {'), mb, ED.slice(ED.indexOf("dc_omegacore: {"), ED.indexOf("dc_omegacore: {") + 2000)];
ok(nnRegions.every(function (t) { return !/125000|125,000|\$125|575000|575,000/.test(t); }), 'the page carries no controller or skid price where it names NextNRG');
var OCQ = fs.readFileSync(path.join(ROOT, 'omega-core-qualify.js'), 'utf8');
ok(/\+ NextNRG Microgrid Controller on one 28/.test(OCQ) && /p\.systemCostBreakdown/.test(OCQ) && !/125000|575000/.test(OCQ), 'the Omega-Core dialog names the controller and draws the server\'s breakdown, with no figure of its own');

/* ═══ 6 · the vendor ══════════════════════════════════════════════════ */
var T = JSON.parse(fs.readFileSync(path.join(ROOT, 'tenants', 'nextnrg', 'tenant.json'), 'utf8'));
ok(Array.isArray(T.brands) && T.brands.indexOf('nextnrg') >= 0, 'NextNRG\'s tenant record names its brand, so /api/rfq.js routes a NextNRG line to nextnrg.com');
eq(T.orgId, NN.VENDOR.orgId, 'the same org the record names');
ok(/org\.brands = t\.brands\.map/.test(fs.readFileSync(path.join(ROOT, 'scripts', 'seed-omega-orgs.js'), 'utf8')), 'the seed copies brands[] onto omega_orgs');


/* ═══ 7 · NextNRG Solar — Custom ══════════════════════════════════════
   (Tommy, 2026-10-13: "they have a polyline in here that is a NextNRG
   Solar - Custom … they be able to see their product"): the Power Gen
   flyout item, the trace that chooses NextNRG's module, the array stamped
   as NextNRG's product, and every reader naming it. */
(function () {
  var p0 = pass, f0 = fail;
  ok(/onclick="rbFlyDo\('fly-der',omegaNextnrgSolarCustom\)"[^>]*>[^<]*<span class="fi-ico">[^<]*<\/span> NextNRG Solar — Custom<\/button>/.test(ED), 'Draw › Power Gen has NextNRG Solar — Custom, after Solar — Custom Area');
  var custom = bodyFrom(ED, 'window.omegaNextnrgSolarCustom=function(){');
  ok(/setSolarAssume\('moduleKey','nextnrg-eagle-g7b'\)/.test(custom) && /window\.omegaSolarCustomArea\(\)/.test(custom), 'it chooses NextNRG\'s module for the project and runs the same trace');
  var agl = bodyFrom(ED, 'function applyGroundLayout(boundary, layout, exclusions){');
  var stampFn = bodyFrom(ED, 'function _derStampModule(sh, mount){');
  ok(/sh\.moduleKey=_A\.moduleKey; sh\.moduleWatts=_M\.watts\|\|null;/.test(stampFn) && /sh\.product=_M\.mfr\+' Solar PV \\u2014 '/.test(stampFn) && /sh\.sku=_M\.sku\|\|null;/.test(stampFn), 'the one stamp carries the module, and NextNRG\'s product name and key');
  ok(/_derStampModule\(sh, sh\.mount\)/.test(agl) && /_derStampModule\(sh, L\.mount\)/.test(bodyFrom(ED, 'function _derPlaceSolar(a, b){')), 'the traced array and the rectangle alike are stamped with it (2026-10-14: a rectangle roof was priced at the benchmark beside NextNRG\'s quote)');
  /* run the stamp: NextNRG's module makes a NextNRG product; the generic module makes none */
  var mb2 = ED.slice(ED.indexOf('var DER_PV_MODULES = {'), ED.indexOf('\n', ED.indexOf('var DER_PV_WPSF = ')) + 1);
  var c = vm.createContext({ S: { solarAssume: null } });
  vm.runInContext(mb2 + '\nfunction _solarAssume(){ var k=(S.solarAssume&&S.solarAssume.moduleKey)||DER_PV_MODULE_DEFAULT; return { moduleKey:k, module:DER_PV_MODULES[k] }; }'
    + '\n' + stampFn + '\nfunction stampOf(){ var sh={}; _derStampModule(sh, "roof"); return sh; }', c);
  var st1 = vm.runInContext('stampOf()', c);
  eq(st1.product, 'NextNRG Solar PV \u2014 JinkoSolar EAGLE G7B 640 W', 'with NextNRG\'s module the array is NextNRG\'s product');
  eq(st1.sku + '/' + st1.mfr + '/' + st1.moduleWatts, 'NEXTNRG-PV-EAGLE-G7B/NextNRG/640', 'with its key, brand and watts');
  var st2 = vm.runInContext('S.solarAssume={moduleKey:"generic-550"}; stampOf()', c);
  ok(st2.moduleKey === 'generic-550' && st2.product === undefined && st2.mfr === undefined, 'the generic module makes no product: a name is never invented');
  ok(/if\(sh\.product\) _derText\(g, x\+w\/2, y\+h\/2\+\(sh\.gcr\?35:24\), sh\.product/.test(bodyFrom(ED, 'function _derRenderSolar(g, sh){')), 'the drawing says whose product the array is');
  ok(/add\(sh\.product \? \('pv:'\+sh\.product\) : 'pv', '\\u2600', sh\.product \|\| 'Solar array', sh\.kw\)/.test(ED), 'the legend names it');
  ok(/'<span class="li-txt">'\+\(_pvProd\|\|'Solar PV'\)/.test(ED), 'so does the equipment key');
  ok(/inv\.der\.push\(\{ type: sh\.product\|\|'Solar PV', kw: sh\.kw\|\|null, module: sh\.moduleKey\|\|null \}\)/.test(ED), 'and the electrical inventory');
  ok(/_pvs\?' \\u2014 '\+_pvs\.product/.test(bodyFrom(ED, 'function buildBOM(')), 'and the BOM\'s solar line');
  console.log('  solar custom: ' + (pass - p0) + ' passed, ' + (fail - f0) + ' failed');
})();


/* ═══ 8 · the BOM: a pad placed from the library, and an array's mount ═══
   (Tommy, 2026-10-13: "The battery that we placed from NextNRG from the
   draw feature is not showing up in the BOM" — and — "it's showing as a
   ground mount, and we put this as a roof … it really should just say
   solar, unless we go in and edit the array and choose it"). */
(function () {
  var p0 = pass, f0 = fail;
  var bom = bodyFrom(ED, 'function buildBOM(');
  /* run the census and the lines against a drawing: a NextNRG block placed
     as an assembly, a library pad with no catalog row, a plain pad, the
     master controller (a pad that is not a battery), three arrays */
  var census = bom.slice(bom.indexOf('  var _cs = { pods:0'), bom.indexOf('  if(_cs.pods){'));
  var lines = bom.slice(bom.indexOf('  if(_cs.bess){'), bom.indexOf('  if(_cs.mvFt){'));
  var items = [];
  var cx = vm.createContext({
    S: { pxPerFt: 10, shapes: [
      { id: 'a1', kind: 'assembly', catalogKey: 'NEXTNRG-SAFT-IFLEX-3400', model: 'NextNRG Microgrid Storage — Saft Intensium Flex 3.4 MWh block (LFP)', unitKwh: 3400, unitKw: null, cx: 0, cy: 0, parts: [] },
      { id: 'b1', kind: 'bespad', model: 'NextNRG Model 1', unitKwh: 1000, unitKw: 250, pts: [{ x: 0, y: 0 }] },
      { id: 'b2', kind: 'bespad', model: 'NextNRG Model 1', unitKwh: 1000, unitKw: 250, pts: [{ x: 0, y: 0 }] },
      { id: 'mc', kind: 'bespad', omegaController: true, model: 'MASTER CONTROLLER', pts: [{ x: 0, y: 0 }] },
      { id: 's1', kind: 'dersolar', mount: 'custom', kw: 368 },
      { id: 's2', kind: 'dersolar', mount: 'roof', kw: 120 },
      { id: 's3', kind: 'dersolar', mount: 'ground', kw: 50 } ], conduits: [] },
    BESS_CATALOG: { 'NEXTNRG-SAFT-IFLEX-3400': { mfr: 'NextNRG', model: 'NextNRG Microgrid Storage — Saft Intensium Flex 3.4 MWh block (LFP)' } },
    addItem: function (cat, desc, size, qty, unit, note, sku, mfr) { var o = { category: cat, description: desc, size: size, qty: qty, unit: unit, note: note, sku: sku || '', mfr: mfr || '' }; items.push(o); return o; },
    _pvModule: function () { return { label: 'JinkoSolar EAGLE G7B 640 W — NextNRG-specified', watts: 640, sku: 'NEXTNRG-PV-EAGLE-G7B', mfr: 'NextNRG' }; },
    OmegaComputeCost: null, omegaGenBenchCost: null, window: {}, UTILITY_CATALOG: {}
  });
  vm.runInContext(census + '\n' + lines, cx);
  var bess = items.filter(function (it) { return it.category === 'Energy Storage'; });
  eq(bess.length, 2, 'two battery lines: one per product placed (the master controller is not a battery)');
  var nn = bess.filter(function (it) { return it.sku === 'NEXTNRG-SAFT-IFLEX-3400'; })[0];
  ok(nn && nn.qty === 1 && /Intensium Flex 3\.4 MWh/.test(nn.description) && nn.mfr === 'NextNRG' && /3,400 kWh total/.test(nn.note) && /placed as an assembly/.test(nn.note), 'the NextNRG block placed as an ASSEMBLY is on the BOM under its name, with its key and brand, as an assembly');
  var lib = bess.filter(function (it) { return /NextNRG Model 1/.test(it.description); })[0];
  ok(lib && lib.qty === 2 && /1,000 kWh \/ 250 kW each/.test(lib.size) && /2,000 kWh total/.test(lib.note) && /outdoor enclosure/.test(lib.note), 'two library pads of one model are one line of two, rated off the pad tool\'s own fields');
  var solar = items.filter(function (it) { return it.category === 'Solar'; });
  eq(solar.map(function (it) { return it.description.split(' — ')[0] + ':' + it.size; }).join(' | '), 'Solar PV array (custom area):368 kW-DC | Rooftop PV array:120 kW-DC | Ground-mount PV array:50 kW-DC', 'one solar line per mount AS DRAWN: a traced custom area is not called ground');
  ok(/mount not chosen: Array — Edit Size \/ Capacity sets ground, roof or canopy/.test(solar[0].note), 'and the custom line says where a mount is chosen');
  ok(solar.every(function (it) { return it.sku === 'NEXTNRG-PV-EAGLE-G7B' && it.mfr === 'NextNRG'; }), 'every solar line carries the module\'s key and brand');
  /* the mount itself */
  var oal = bodyFrom(ED, 'function openAutoLayout(boundaryPts){');
  ok(/window\._alCustom=!!\(boundaryPts && boundaryPts\.length>=3\);/.test(oal) && /window\._alMount=window\._alCustom \? \(\(typeof _derSolarMount!=='undefined'/.test(oal) && /<select id="al-mount" onchange="alMountChanged\(this\.value\)"/.test(oal), 'a traced outline opens the layout as a custom area with a mount (the ribbon\'s Solar choice, changeable on the modal); the ribbon\'s Auto Layout stays ground (2026-10-14: a traced roof filled with the ground preset read far less kW than the roof rectangle)');
  ok(/mount:\(window\._alMount==='roof'\|\|window\._alMount==='adjacent'\)\?window\._alMount:'ground',/.test(bodyFrom(ED, 'function applyGroundLayout(boundary, layout, exclusions){')) && /mount:window\._alMount\|\|'ground' \}\);/.test(bodyFrom(ED, 'function alPreview(){')), 'the layout fills with that mount\'s preset and the array carries it');
  var bm = vm.createContext({ S: { shapes: [{ kind: 'dersolar', mount: 'custom', kw: 368 }, { kind: 'dersolar', mount: 'roof', kw: 120 }, { kind: 'dersolar', mount: 'ground', kw: 50 }, { kind: 'dersolar', mount: 'custom', canopy: true, kw: 7 }] } });
  vm.runInContext(bodyFrom(ED, 'function omegaSolarByMount(){'), bm);
  eq(JSON.stringify(vm.runInContext('omegaSolarByMount()', bm)), JSON.stringify({ ground: 50, roof: 120, canopy: 7 }), 'the Run\'s by-mount kW leaves a custom area out, so the server prices it as plain PV at the size band — never as ground');
  ok(/sh\.mount==='custom'\?'CUSTOM AREA'/.test(bodyFrom(ED, 'function _derRenderSolar(g, sh){')), 'the drawing says CUSTOM AREA');
  ok(/function mountSelect\(sh\)/.test(ED) && /<select id="osz-mount"/.test(ED) && /\['custom', 'Not chosen/.test(ED), 'the array editor offers the mount: not chosen, ground, rooftop, canopy');
  ok(/if \(mv && mv\.value && MOUNTS\.some\(function \(m\) \{ return m\[0\] === mv\.value; \}\)\) \{ sh\.mount = mv\.value; sh\.canopy = \(mv\.value === 'adjacent'\); \}/.test(ED), 'and Apply writes the choice onto the array before anything else is recomputed');
  console.log('  bom + mount: ' + (pass - p0) + ' passed, ' + (fail - f0) + ' failed');
})();

console.log('nextnrg: ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
