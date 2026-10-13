/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   The field lock covers what the compute pack PLACED and nothing a person
   traced (Tommy, 2026-10-13: a custom canopy had no delete while a drawn
   array did). The lock swallows the mousedown on a "placed" shape at
   document capture, so whatever it judges placed can be neither selected
   nor deleted. It judged every `autoLayout` array placed, and a traced
   canopy or custom area is built through the same applyGroundLayout.
   `isPlaced` is cut out of editor.html and run; the pack's own solar fills
   are held to marking their arrays. */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const SRC = fs.readFileSync(path.join(__dirname, '..', '..', 'editor.html'), 'utf8');
const k = SRC.indexOf('  function isPlaced(sh) {');
assert(k > 0, 'isPlaced found');
const body = SRC.slice(k, SRC.indexOf('\n  }\n', k) + 4);
const ctx = {}; vm.createContext(ctx); vm.runInContext(body, ctx);
let count = 0;
function ok(v, label) { assert(v, label); count++; }
const P = ctx.isPlaced;
ok(P({ kind: 'dersolar', autoLayout: true, omegaCompute: true }) === true, 'the pack\'s solar field is locked');
ok(P({ kind: 'derdc', omegaCompute: true }) === true, 'a placed pod is locked');
ok(P({ kind: 'dersolar', autoLayout: true, canopy: true, mount: 'adjacent' }) === false, 'a traced canopy is not locked');
ok(P({ kind: 'dersolar', autoLayout: true }) === false, 'a custom-area array a person laid out is not locked');
ok(P({ kind: 'dersolar', mount: 'ground' }) === false, 'a drawn rectangle array is not locked');
ok(P({ kind: 'substation', omegaCompute: true }) === false, 'the substation is never locked');
ok(P({ kind: 'polyline', omegaRole: 'boundary', omegaCompute: true }) === false, 'the boundary is never locked');
/* the two campus fills that did not mark their arrays now do */
ok(/var made = root\.applyGroundLayout\(ringPx, lay, blds \|\| \[\]\);\s*if \(made\) made\.omegaCompute = true;/.test(SRC), 'the campus ring fill marks its array as the pack\'s');
ok(/var made = applyGroundLayout\(poly, layout, excl\); if \(made\) made\.omegaCompute = true;/.test(SRC), 'the campus solar fill marks its array as the pack\'s');
ok(/sh\.omegaCompute = true;\s*\/\* cleared with the rest of the build \*\//.test(SRC), 'the solar zone fill still marks its array');
/* a canopy is selected the moment it is built, in Select mode */
const c = SRC.slice(SRC.indexOf('window.omegaCanopyFromShape=function(shape){'), SRC.indexOf('window.omegaCanopyCustom=function(){'));
ok(/setMode\('select'\)/.test(c) && /selectShape\(made\.id\)/.test(c), 'a built canopy goes back to Select and is selected, so its handles and delete are there');
console.log('tfieldlock: ' + count + ' checks passed');
