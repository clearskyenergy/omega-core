/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var assert = require('assert');
var fs = require('fs');
var vm = require('vm');
var context = {window: {}};
vm.runInNewContext(fs.readFileSync('omega-doom.js', 'utf8'), context);
var seed = 17;
function random() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
var planner = context.window.OmegaDoom.createMotion(random);
var last = Array(10).fill(0), left = false, right = false, quiet = false, peak = 0;
for (var frame = 0; frame < 60 * 90; frame++) {
  var pose = planner.step(1 / 60, true, false);
  pose.forEach(function(v, i) {
    assert(Number.isFinite(v) && Math.abs(v) < 1.3, 'Bounded joint angle');
    assert(Math.abs(v - last[i]) < .07, 'Continuous pose transition');
  });
  if (pose[0] < -.4 && pose[1] > -.3) left = true;
  if (pose[1] < -.4 && pose[0] > -.3) right = true;
  var strength = pose.reduce(function(sum, v) { return sum + Math.abs(v); }, 0);
  peak = Math.max(peak, strength);
  if (frame > 300 && strength < .001) quiet = true;
  last = pose;
}
assert(left && right && quiet && peak > 1, 'Alternating hands and pauses occur');
for (var i = 0; i < 240; i++) last = planner.step(1 / 60, false, false);
assert(last.every(function(v) { return Math.abs(v) < .00001; }), 'Speech stop returns to rest');
for (var j = 0; j < 600; j++) last = planner.step(1 / 60, true, true);
assert(last.every(function(v) { return Math.abs(v) < .00001; }), 'Reduced motion remains at rest');
console.log('PASS: varied hands, quiet gaps, bounded smooth motion, stop and reduced motion');
