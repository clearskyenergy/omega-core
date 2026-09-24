/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   The product pick behind the site finder's "What fits here": one unit of
   the closest product beats a stack of small cabinets. */
'use strict';
var assert = require('assert'), C = require('../omega-bess-catalog.js');
var P = C.products();
function best(kw, kwh) { var o = C.fit(P, kw, kwh); return o[0] ? o[0].units + 'x' + o[0].model : null; }
assert.equal(best(750, 3000), '1xESD1267-05P3421', 'a 3 MWh need is one 3.4 MWh container, not four cabinets');
assert.equal(best(1000, 3000), '1xESD1267-05P3421');
assert.equal(best(1000, 4000), '1xESD1280-05P4608');
assert.equal(best(1250, 5000), '1xESD1331-05P5015', 'closest single product above the need');
assert.equal(best(250, 1000), '1xESD1267-05P760-G', 'one 760 cabinet at 3 h is the closest product to a 1,000 kWh ask');
assert.equal(best(500, 2000), '1xESD1126-05P2703');
assert.equal(best(50, 200), '1xESD768-05P220');
assert.equal(best(100, 400), '1xESD1267-05P760-G', 'one cabinet beats two smaller ones');
assert.equal(C.fit([{ model: 'S', kwh: 220, acKw: 100 }], 250, 500)[0].units, 3, 'where the sheet states AC kW, the count must cover the power too');
assert.equal(C.fit([{ model: 'S', kwh: 220, acKw: 100 }], 250, 1000)[0].units, 4, 'the deck example: four 220 cabinets give 880 kWh at 250 kW');
var o = C.fit(P, 250, 1000);
assert.ok(o[0].under && Math.abs(o[0].hours - 3.04) < 0.01, 'an under-fill is flagged and its true hours reported');
assert.ok(o.every(function (x) { return x.units <= 4 && x.ratio <= 2.2; }), 'stacks over four units and gross overshoot are dropped');
assert.ok(!o.some(function (x) { return x.model === 'ESD768-05P220' && x.units < 3; }), 'a 100 kW cabinet cannot serve 250 kW alone');
var tiny = C.fit(P, 10, 40);
assert.equal(tiny.length, 1); assert.equal(tiny[0].model, 'ESD832-05P160', 'nothing qualifies within 2.2x, so the smallest overshoot is kept because you cannot buy less than one');
assert.deepEqual(C.fit(P, 0, 0), []);
assert.equal(C.fit([{ model: 'B', kwh: 1000 }], 100, 1000)[0].units, 1);
console.log('catalog fit: one unit of the closest product wins — ' + best(750, 3000) + ' for 3 MWh, ' + best(250, 1000) + ' for 1 MWh.');
