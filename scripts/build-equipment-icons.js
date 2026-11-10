#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 *
 * scripts/build-equipment-icons.js — Site Map's unit icons, for Omega Maximus.
 *
 * Site Map (editor.html) draws every unit as its icon: `const ICONS` there,
 * one function per unit returning an SVG badge. Omega Maximus shows the
 * same pictures under View › Icons (Tommy, 2026-10-21: "a function that
 * puts the icons or images of the units like we had in the first editor").
 * editor.html is not edited from Maximus's side (the handoff's rule), so
 * this reads the library out of editor.html, draws each icon once, and
 * writes omega-equipment-icons.js: the same SVG, as plain strings, in ES5.
 *
 *   node scripts/build-equipment-icons.js           writes omega-equipment-icons.js
 *   node scripts/build-equipment-icons.js --check   fails when it is stale
 *
 * scripts/tests/teditorv2icons.js runs --check in npm test, so a change to
 * Site Map's icons that is not carried here fails the build. Never edit the
 * written file by hand.
 */
'use strict';
var fs = require('fs');
var path = require('path');
var ROOT = path.join(__dirname, '..');
var OUT = path.join(ROOT, 'omega-equipment-icons.js');

/* the icon library, as editor.html defines it, drawn at 60 px. Comments go:
   Maximus loads each icon as image/svg+xml, an XML parse, and a "--"
   inside an authoring comment is illegal XML that drops the icon in
   silence (Site Map's pole, fixed there 2026-10-28) */
function library() {
  var html = fs.readFileSync(path.join(ROOT, 'editor.html'), 'utf8');
  var at = html.indexOf('const ICONS={');
  if (at < 0) throw new Error('editor.html has no `const ICONS={`');
  var end = html.indexOf('\n};', at);
  if (end < 0) throw new Error('editor.html: the ICONS object does not close');
  var src = html.slice(at, end + 3).replace(/^const ICONS=/, 'var ICONS=');
  var ICONS = (new Function(src + '\nreturn ICONS;'))();
  var out = {};
  Object.keys(ICONS).forEach(function (k) {
    var svg = String(ICONS[k](60)).replace(/<!--[\s\S]*?-->/g, '').replace(/\s*\n\s*/g, ' ').trim();
    if (!/^<svg[\s>]/.test(svg)) throw new Error('icon ' + k + ' is not an SVG');
    out[k] = svg;
  });
  return out;
}

function render(lib) {
  var keys = Object.keys(lib);
  var body = keys.map(function (k) { return '    ' + JSON.stringify(k) + ': ' + JSON.stringify(lib[k]); }).join(',\n');
  return [
    '/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.',
    ' *',
    ' * omega-equipment-icons.js — Site Map\'s unit icons (editor.html `const ICONS`),',
    ' * drawn once at 60 px. WRITTEN by scripts/build-equipment-icons.js: never edit',
    ' * by hand; rebuild it, and scripts/tests/teditorv2icons.js fails when it is',
    ' * stale. ' + keys.length + ' icons.',
    ' */',
    '(function (root) {',
    '  \'use strict\';',
    '  var SVG = {',
    body,
    '  };',
    '  root.OmegaEquipmentIcons = { SVG: SVG, keys: function () { return Object.keys(SVG); } };',
    '  if (typeof module !== \'undefined\' && module.exports) module.exports = root.OmegaEquipmentIcons;',
    '})(typeof window !== \'undefined\' ? window : global);',
    ''
  ].join('\n');
}

if (require.main === module) {
  var text = render(library());
  if (process.argv.indexOf('--check') > 0) {
    var have = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
    if (have !== text) { console.error('omega-equipment-icons.js is stale: run node scripts/build-equipment-icons.js'); process.exit(1); }
    console.log('omega-equipment-icons.js matches Site Map\'s icons');
  } else {
    fs.writeFileSync(OUT, text);
    console.log('wrote omega-equipment-icons.js (' + Math.round(text.length / 1024) + ' KB)');
  }
}
module.exports = { library: library, render: render, OUT: OUT };
