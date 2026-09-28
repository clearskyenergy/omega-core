#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   A service pedestal on the site map reaches the EV Cost Workbook as a new
   service, and the drawing's equipment counts reach it at all.

   Why (Menachem, 431-437 Sunderland St, 2026-09-28): "I'm doing a job where
   I'm putting 2 new pedestal services. Any way I can show that in the site
   map?" There was no such thing to place, and the counts the editor hands
   the workbook (bollards, pads, pedestals, the meter) were every one zero:
   _evCountsFromCanvas read the element's `type` first, which is 'eq' or
   'evgear' for everything ever placed, so no kind ever matched. The
   functions are grabbed straight out of the pages, as ttrenchkeep.js does. */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const ED = fs.readFileSync(path.join(ROOT, 'editor.html'), 'utf8');
const WB = fs.readFileSync(path.join(ROOT, 'ev-cost-workbook.html'), 'utf8');

function bodyFrom(src, needle) {
  const hits = [];
  for (let k = src.indexOf(needle); k >= 0; k = src.indexOf(needle, k + 1)) hits.push(k);
  if (hits.length !== 1) throw new Error(needle + ' appears ' + hits.length + ' times');
  let k = src.indexOf('{', hits[0]), d = 0;
  for (;; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (!d) break; } }
  return src.slice(hits[0], k + 1);
}
function arrayFrom(src, needle) {
  const hits = [];
  for (let k = src.indexOf(needle); k >= 0; k = src.indexOf(needle, k + 1)) hits.push(k);
  if (hits.length !== 1) throw new Error(needle + ' appears ' + hits.length + ' times');
  let k = src.indexOf('[', hits[0]), d = 0;
  for (;; k++) { if (src[k] === '[') d++; else if (src[k] === ']') { d--; if (!d) break; } }
  return src.slice(src.indexOf('[', hits[0]), k + 1);
}
function chk(l, ok, x = '') { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`); if (!ok) all = false; return ok; }
let all = true;

console.log('\nthe Insert palette has a service pedestal');
{
  chk('a Service Pedestal button on the Insert tab', /rbInsert\('svcped'\)[^>]*>[\s\S]{0,80}Service<br>Pedestal/.test(ED));
  chk('its title says what it is: a new utility service on a freestanding pedestal', /rbInsert\('svcped'\)[^>]*title="[^"]*new utility service[^"]*freestanding pedestal/i.test(ED));
  const eq = eval('(' + arrayFrom(ED, 'const EQ=[') + ')');
  chk('it is in the equipment list', eq.some(e => e.id === 'svcped' && e.label === 'Service Pedestal'));
  const fp = eval('(' + bodyFrom(ED, 'var EQ_FOOTPRINT_FT = {').replace(/^var EQ_FOOTPRINT_FT = /, '') + ')');
  chk('with a footprint of its own: a pedestal on its base, not a meter can', fp.svcped && fp.svcped.lf === 3 && fp.svcped.wf === 2 && fp.meter.lf === 1.5);
  chk('and a palette icon drawn for it', /svcped:\(s=60\)=>`<svg[\s\S]*?<\/svg>`,/.test(ED));
  const icons = require(path.join(ROOT, 'omega-ribbon-icons.js'));
  chk('the ribbon icon set draws it (tribbonicons.js would refuse the placeholder)', icons.pathFor('Service Pedestal') !== icons.FALLBACK && /^M/.test(icons.pathFor('Service Pedestal')));
  chk('the click-place wizard has an electrical note for it', /case 'svcped': return \{\s*label:'SERVICE PEDESTAL -- ELEC NOTE'/.test(ED));
}

console.log('\nthe Level 2 build can start from one');
{
  const l2 = eval('(' + bodyFrom(ED, 'var L2_SERVICE = {').replace(/^var L2_SERVICE = /, '') + ')');
  chk('a fourth Start from option, after existing / upgrade / new', Object.keys(l2).join() === 'existing,upgrade,new,pedestal');
  chk('its node is a New Service Pedestal and its note says one build per pedestal', l2.pedestal.node === 'New Service Pedestal' && /run the build once per pedestal/.test(l2.pedestal.note));
  chk('the placed service node is flagged, so the counts and the symbol know', /if\(DCFC\.level2 && DCFC\.l2Service==='pedestal'\) poi\.svcPedestal=true;/.test(ED));
  chk('a flagged service node wears the pedestal symbol', /el\.evKind==='service' && el\.svcPedestal && ICONS\.svcped/.test(ED));
}

console.log('\nthe counts the workbook receives');
{
  global.S = { elements: [] };
  (0, eval)(bodyFrom(ED, 'function _evCountsFromCanvas('));
  S.elements = [
    { type: 'eq', eqId: 'svcped', label: 'Service Pedestal' },
    { type: 'eq', eqId: 'svcped', label: 'Service Pedestal' },
    { type: 'eq', eqId: 'bollard', label: 'B1' }, { type: 'eq', eqId: 'bollard', label: 'B2' }, { type: 'eq', eqId: 'bollard', label: '' },
    { type: 'eq', eqId: 'pad', label: 'Concrete Pad' },
    { type: 'eq', eqId: 'jbox', label: 'Junc. Box' },
    { type: 'evgear', evKind: 'xfmr', label: 'Transformer' },
    { type: 'evgear', evKind: 'panel', label: 'Outdoor Panel / Disconnect' },
    { type: 'evgear', evKind: 'charger', label: 'EVSE 1 · Autel AC Pro' },
    { type: 'evgear', evKind: 'charger', label: 'EVSE 2–3 · Autel AC Elite ×2', units: 2, pedestal: true },
    { type: 'evgear', evKind: 'charger', label: 'Future stall', futureProof: true },
  ];
  const c = _evCountsFromCanvas();
  chk('two service pedestals from Insert are two, and the service is new', c.servicePedestal === 2 && c.newService === true && c.existingService === false, JSON.stringify(c));
  chk('bollards, the pad and the handhole are counted by what they are, not by which palette placed them', c.bollard === 3 && c.pad === 1 && c.handhole === 1, JSON.stringify(c));
  chk('a guided-build transformer is a transformer pad, its panel a panel', c.xfmrpad === 1 && c.panel === 1);
  chk('chargers: a dual pedestal is two chargers on one pedestal; a future stall is a position', c.charger === 3 && c.pedestal === 1 && c.fpPositions === 1, JSON.stringify(c));

  S.elements = [
    { type: 'evgear', evKind: 'service', label: 'New Service Pedestal', svcPedestal: true },
    { type: 'evgear', evKind: 'panel', label: 'Outdoor Panel / Disconnect' },
  ];
  const b = _evCountsFromCanvas();
  chk('a Level 2 build started from a pedestal counts one, a new service', b.servicePedestal === 1 && b.newService === true);

  S.elements = [{ type: 'evgear', evKind: 'service', label: 'New Meter Bank' }];
  chk('a build started from a new meter is a new service, not a pedestal', _evCountsFromCanvas().newService === true && _evCountsFromCanvas().servicePedestal === 0);

  S.elements = [{ type: 'evgear', evKind: 'service', label: 'Existing Meter Bank' }, { type: 'eq', eqId: 'meter', label: 'Meter' }];
  const e = _evCountsFromCanvas();
  chk('an existing meter bank still reads as the existing service, and a meter can is a meter', e.existingService === true && e.newService === false && e.servicePedestal === 0 && e.meter === 1);
}

console.log('\nthe workbook prices it as a new service');
{
  const items = eval('(' + bodyFrom(WB, 'var STANDARD_ITEMS = {').replace(/^var STANDARD_ITEMS = /, '') + ')');
  chk('a pedestal hardware allowance, on the Level 2 card, labelled as what it is', items.l2.servicePedestal && items.l2.servicePedestal.mat > 0 && /freestanding/.test(items.l2.servicePedestal.label));
  const std = eval('(' + arrayFrom(WB, 'var STANDARD=[') + ')');
  const row = std.filter(r => r[4] === 'svcPedestal')[0];
  chk('a standard row on the metering line, gated on the drawing, priced by its own rate', !!row && row[1] === 'mr' && row[2] === 'meter' && row[3] === true);
  chk('addStandardRows prices a row by its fifth field when it has one', /rate=standardRate\(STANDARD\[i\]\[4\]\|\|row, bucket\);/.test(WB));
  chk('the rate is the socket and its labour per pedestal plus the allowance, and nothing without a pedestal', /case 'svcPedestal':[\s\S]{0,200}if\(!\(_nsp>0\)\) return null;[\s\S]{0,400}mat:\(ST\.metering\.mat\+ST\.servicePedestal\.mat\)\*_nsp,\s*lab:ST\.metering\.lab\*_nsp/.test(WB));
  chk('the note on the sheet says the hardware is an allowance to confirm', /pedestal hardware is an allowance, confirm against the utility spec/.test(WB));
  chk('the count arrives from the editor', /if\(num\(EDITOR_COUNTS\.servicePedestal\)>0\) DATA\.nServicePedestal = num\(EDITOR_COUNTS\.servicePedestal\);/.test(WB));
  chk('and answers the service question as New service, after an existing meter bank has had its say', /EDITOR_COUNTS\.existingService\)\s*DATA\.serviceScenario = SERVICE_SCENARIOS\[0\];\s*else if\(!d\('serviceScenario'\) && \(num\(EDITOR_COUNTS\.servicePedestal\)>0 \|\| EDITOR_COUNTS\.newService\)\)\s*DATA\.serviceScenario = SERVICE_SCENARIOS\[2\];/.test(WB));
  const scen = eval('(' + arrayFrom(WB, 'var SERVICE_SCENARIOS = [') + ')');
  chk('and index 2 is New service', scen[2] === 'New service');
}

console.log(all ? '\nALL PASS' : '\nFAILURES');
process.exit(all ? 0 : 1);
