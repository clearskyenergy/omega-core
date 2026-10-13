#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   A click on a BESS pad opens the panel that edits its bollards and
   fencing (Tommy, 2026-10-13: "click on a bess pad and have that panel pop
   up that allows me to edit the bollards and fencing … idk why that
   disapeared"). The panel only ever opened from an ASSEMBLY'S PARTS: a
   plain pad (Draw › BESS Pad with nothing ticked) had no panel at all, and
   the Omega-Core skid — a pad with a battery on it — none either.

   Held here:
     1 · a plain pad becomes an assembly of one part on first click, in
         place, same id, and the panel opens on it
     2 · the Omega-Core skid gets the same perimeter fields and the panel
     3 · ONE drawer of fence sides and bollards (_drawProtection) serves
         the assembly renderer and the skid renderer
     4 · the panel tolerates a shape with no parts

     node scripts/tests/tpadpanel.js */
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

/* ═══ 1 · the plain pad, converted on click ════════════════════════════ */
var rendered = [], restamped = [];
var c = vm.createContext({ S: { pxPerFt: 10, shapes: [] }, renderShape: function (sh) { rendered.push(sh.id); }, _geoRestampOne: function (sh) { restamped.push(sh.id); } });
vm.runInContext(bodyFrom(ED, 'function _padToAssembly(sh){') + '\n' + bodyFrom(ED, 'function _skidProtection(sh){') + '\n' + bodyFrom(ED, 'function _asmSides(sh){'), c);
var pad = { id: 'p1', kind: 'bespad', pts: [{ x: 100, y: 200 }], lf: 20, wf: 8, model: 'Gotion Grid 3.42 MWh Container', catalogKey: 'GOTION-GRID-3421', unitKwh: 3421.4, unitKw: 1710 };
c.S.shapes.push(pad);
var out = vm.runInContext('_padToAssembly(S.shapes[0])', c);
ok(out === c.S.shapes[0], 'converted IN PLACE: the same object, the same id');
eq(out.kind, 'assembly', 'a plain pad becomes an assembly');
eq(out.cx + '/' + out.cy, '200/240', 'centred where the pad was (top-left + half the footprint at 10 px/ft)');
ok(!('pts' in out), 'the pad\'s corner point is gone: an assembly lives by its centre');
eq(out.parts.length, 1, 'of ONE part');
ok(out.parts[0].key === 'bess' && out.parts[0].isBattery === true && out.parts[0].lf === 20 && out.parts[0].wf === 8 && out.parts[0].dx === 0 && out.parts[0].dy === 0, 'the container itself, at its size, centred');
eq(out.parts[0].label, 'Gotion Grid 3.42 MWh Container', 'under its model');
eq(JSON.stringify(out.sides), JSON.stringify({ n: 'none', e: 'none', s: 'none', w: 'none' }), 'no fence and no bollards until the panel sets them');
eq(out.fenceClear + '/' + out.bollardOffset + '/' + out.bollardSpacing, '10.5/2.33/3', 'the assembly\'s own defaults for when it does');
ok(out.hasAssembly === false && out.hasFence === false && out.hasBollards === false, 'no gear column was invented, and the flags agree with the sides');
ok(out.catalogKey === 'GOTION-GRID-3421' && out.unitKwh === 3421.4 && out.unitKw === 1710, 'what the pad carried for the fleet and the cost is kept');
eq(rendered.join(','), 'p1', 'redrawn once, by the assembly renderer from now on');
eq(restamped.join(','), 'p1', 'and re-anchored on the map');
var flagged = { id: 'p2', kind: 'bespad', pts: [{ x: 0, y: 0 }], lf: 10, wf: 5, hasFence: true, hasBollards: false };
var out2 = vm.runInContext('_padToAssembly(' + JSON.stringify(flagged) + ')', c);
eq(JSON.stringify(out2.sides), JSON.stringify({ n: 'fence', e: 'fence', s: 'fence', w: 'fence' }), 'a pad already flagged for a fence keeps it on every side');
eq(vm.runInContext('_padToAssembly({ id:"a", kind:"assembly", cx:1, cy:1, parts:[] })', c), null, 'an assembly is left alone');
eq(vm.runInContext('_padToAssembly({ id:"d", kind:"derdc", pts:[{x:0,y:0}] })', c), null, 'so is anything that is not a pad');

/* ═══ 2 · the skid ═════════════════════════════════════════════════════ */
var skid = vm.runInContext('_skidProtection({ id:"s", kind:"derdc", omegaCore:true })', c);
eq(JSON.stringify(skid.sides), JSON.stringify({ n: 'none', e: 'none', s: 'none', w: 'none' }), 'the skid gets the perimeter fields, off');
eq(skid.fenceClear + '/' + skid.bollardOffset + '/' + skid.bollardSpacing, '10.5/2.33/3', 'with the same defaults');
var kept = vm.runInContext('_skidProtection({ id:"s2", kind:"derdc", omegaCore:true, sides:{n:"both",e:"none",s:"none",w:"fence"}, fenceClear:6 })', c);
ok(kept.sides.n === 'both' && kept.sides.w === 'fence' && kept.fenceClear === 6, 'and keeps what a saved project already set');

/* ═══ 3 · the click, and the one drawer ════════════════════════════════ */
var md = bodyFrom(ED, 'function _shapeMouseDown(e, id){');
ok(/if\(sh\.kind==='bespad'\)\{ var _cv=_padToAssembly\(sh\); if\(_cv\)\{ sh=_cv; _drawShapeHandles\(sh\); _openAsmPanel\(sh, 0\); \} \}/.test(md), 'a click on a plain pad converts it and opens the panel');
ok(/else if\(sh\.kind==='assembly'\)\{ _openAsmPanel\(sh, -1\); \}/.test(md), 'a click on an assembly opens the panel');
ok(/else if\(sh\.kind==='derdc' && sh\.omegaCore\)\{ _skidProtection\(sh\); _openAsmPanel\(sh, -1\); \}/.test(md), 'a click on the Omega-Core skid opens the panel');
ok(md.indexOf('selectShape(id);') < md.indexOf('_padToAssembly(sh)'), 'after the shape is selected, before the drag begins');
var drawer = bodyFrom(ED, 'function _drawProtection(g, sh, bb, ppf){');
ok(/var sides=_asmSides\(sh\);/.test(drawer) && /sh\.bollardCount = trueCount;/.test(drawer) && /return \{ fx:fx, fy:fy, fw:fw, fh:fh, clr:clr, sides:sides, anyFence:anyFence \};/.test(drawer), 'ONE drawer: the sides, the fence, the bollards and the count the take-off reads');
ok(!/_asmPartsBBoxPx/.test(drawer), 'drawn round the box it is handed, not round parts it assumes');
var asm = bodyFrom(ED, 'function _renderAssembly(g, sh){');
ok(/var _prot=_drawProtection\(g, sh, _asmPartsBBoxPx\(sh, ppf\), ppf\);/.test(asm) && !/trueCount/.test(asm), 'the assembly renderer hands it the parts\' box and keeps no copy');
var dc = bodyFrom(ED, 'function _derRenderDc(g, sh){');
ok(/if\(sh\.sides\)\{ try\{ _drawProtection\(g, sh, \{ x:x, y:y, w:w, h:h \}, ppf\); \}catch\(e\)\{\} \}/.test(dc), 'the skid renderer hands it the skid frame, once the panel has set anything');
ok(ED.indexOf('function _drawProtection(') < ED.indexOf('function _renderAssembly(g, sh){'), 'defined before the renderer that calls it');

/* ═══ 4 · the panel with no parts ══════════════════════════════════════ */
var fill = bodyFrom(ED, 'function _fillAsmPanel(sh, activeIdx){');
ok(/var _parts=sh\.parts\|\|\[\];/.test(fill) && /for\(var i=0;i<_parts\.length;i\+\+\)/.test(fill) && /_parts\[activeIdx\]/.test(fill), 'the panel reads parts through one guarded list');
ok(/sh\.kind==='derdc' \? 'Omega-Core skid \\u2014 perimeter' : 'BESS Assembly'/.test(fill), 'and is headed for the skid as the skid');
ok(/if\(_parts\.length>1\) h\+='<button onclick="_asmResetLayout/.test(fill), 'Reset layout is offered only where there is a layout to reset');
ok(/if\(!sh \|\| !sh\.parts\) return;/.test(bodyFrom(ED, 'function _asmResetLayout(shId){')), 'and refuses a shape with no parts');
ok(/h\+=_asmSideRow\('North','n',sides\.n,sh\.id\);/.test(fill) && /_asmNumRow\('Bollard offset \(ft\)','asm-boff',sh\.bollardOffset,sh\.id\)/.test(fill), 'the perimeter rows — fence or bollards per side, clearance, spacing, offset — are the panel\'s, for every shape it opens on');

console.log('padpanel: ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
