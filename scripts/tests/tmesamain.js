/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * 29 W Main St, Mesa. Layout, neighbor shade, and the clear-sky year.
 * The kWh figures are this engine, not a HelioScope file and not a TMY.
 */
'use strict';
var path = require('path');
var Site = require(path.join(__dirname, '../../api/_lib/solar-site-main.js'));

var failed = 0;
function check(cond, msg) {
  if (!cond) { failed++; console.error('FAIL ' + msg); }
  else console.log('ok   ' + msg);
}

var r = Site.run();
check(r.ok === true, 'the Mesa site designs');
check(r.address === '29 W Main St, Mesa, AZ 85201' && r.apn === '138-41-024', 'the address is the assessor parcel');
check(r.climate === 'desert' && r.weather.indexOf('clear-sky') >= 0, 'the year is the desert clear-sky year');

var roof = r.roof, canopy = r.canopy;
check(roof.mount === 'fixed-ground' && roof.tilt === 10 && roof.azimuth === 180 && roof.setbackFt === 4, 'the roof is 10° south with a 4 ft setback');
check(roof.gcr === 0.778 && roof.pitchFt === 10, 'roof pitch is the 21 December 10:00–14:00 spacing (GCR ' + roof.gcr + ', ' + roof.pitchFt + ' ft)');
check(roof.modules === 124 && roof.placed === 124 && roof.unstrung === 0, 'all 124 roof modules are strung');
check(roof.modulesPerString === 21 && roof.strings === 6 && roof.modulesPerString >= roof.nMin && roof.modulesPerString <= roof.nMax, 'roof strings sit in ' + roof.nMin + '–' + roof.nMax);
check(roof.kwDc === 79.4 && roof.kwAc === 66 && roof.dcAc === 1.2, 'roof is 79.4 kW DC on one 66 kW inverter (DC/AC 1.20, target 1.25)');
check(roof.perWdc === 1.98, 'the roof prices at the commercial $1.98/W');
check(roof.shadePct === 8.7 && roof.specificYield === 1589.6 && roof.acKwh === 126148.1, 'roof year is 1,590 kWh/kW, 8.7% beam shade');
check(roof.p90 < roof.p50 && roof.p90 === 117904.8, 'roof P90 is below P50');
check(roof.rows[0].shadePct < 1 && roof.rows[1].shadePct > 10, 'the front roof row is open and the row behind it carries the self-shade');

check(canopy.mount === 'carport' && canopy.tilt === 7 && canopy.azimuth === 180 && canopy.setbackFt === 5, 'the canopy is a 7° carport with a 5 ft setback');
check(canopy.gcr === 0.831 && canopy.pitchFt === 9.4, 'canopy GCR is the solstice spacing under the 0.9 carport cap');
check(canopy.modules === 180 && canopy.unstrung === 0 && canopy.strings === 8, '180 canopy modules, 8 strings');
check(canopy.kwDc === 115.2 && canopy.kwAc === 132 && canopy.dcAc === 0.87, 'canopy DC/AC is 0.87 because the next inverter is another 66 kW');
check(canopy.perWdc == null, 'the carport has no published $/W');
check(canopy.shadePct === 9.5 && canopy.specificYield === 1488.9 && canopy.acKwh === 171518.9, 'canopy year is 1,489 kWh/kW, 9.5% beam shade');
check(canopy.rows[0].shadePct < 1 && canopy.rows[canopy.rows.length - 1].shadePct > 10, 'canopy shade is row-to-row, not a wall on the south edge');

check(roof.modules === r.open.roofModules && canopy.modules === r.open.canopyModules, 'neighbors shade the arrays and do not remove modules');
check(roof.shadePct >= r.open.roofShade && canopy.shadePct >= r.open.canopyShade, 'neighbors do not reduce the shade');
check(Math.round((roof.shadePct - r.open.roofShade) * 10) === 1, 'the neighbors add 0.1 point of beam shade on the roof');
check(Math.round((canopy.shadePct - r.open.canopyShade) * 10) === 2, 'the neighbors add 0.2 point of beam shade on the canopy');
check(r.open.roofKwh === 126331.2 && r.open.canopyKwh === 171718.6, 'turning the neighbors off is recorded');
check(r.schoolAt40.shadePct === 9.7 && r.schoolAt40.shadePct > canopy.shadePct && r.schoolAt40.acKwh === 171234.1, 'a 40 ft school adds shade and does not rewrite the layout');

check(r.combined.kwDc === 194.6 && r.combined.acKwh === 297667 && r.combined.specificYield === 1530, 'roof plus canopy is 194.6 kW and 297,667 kWh');
check(r.tracedCanopy.modules === 420 && r.tracedCanopy.kwDc === 268.8 && r.tracedCanopy.modules > canopy.modules, 'a canopy on the whole open lot is the larger array');
check(r.tracedCanopy.shadePct === 10.8 && r.tracedCanopy.specificYield === 1469.9 && r.tracedCanopy.acKwh === 395107.4, 'the full-lot canopy stays in the same yield band');
check(roof.oneLine.indexOf('Sungrow') >= 0 && canopy.oneLine.indexOf('combiner') >= 0, 'the one-line names the inverter and the combiner');

if (failed) {
  console.error(failed + ' failed');
  process.exit(1);
}
console.log('29 W Main ok');
console.log('     roof ' + roof.kwDc + ' kWdc, ' + roof.specificYield + ' kWh/kW, shade ' + roof.shadePct + '% (open ' + r.open.roofShade + '%)');
console.log('     canopy ' + canopy.kwDc + ' kWdc, ' + canopy.specificYield + ' kWh/kW, shade ' + canopy.shadePct + '% (open ' + r.open.canopyShade + '%)');
console.log('     traced canopy ' + r.tracedCanopy.kwDc + ' kWdc, ' + r.tracedCanopy.specificYield + ' kWh/kW');
