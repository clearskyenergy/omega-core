#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   What the blueprint sheet says about a charger and a utility pole.

   Why (Menachem, via Tommy, 2026-10-28), four things on one sheet:

     1. "When I change the label and export the blueprint, the icon doesn't
        appear. The utility pole icon also disappears from the legend."
        The label was a red herring. ICONS.pole carried authoring comments
        reading "Step bolts (climbing steps) -- right side". A double hyphen
        INSIDE a comment is illegal XML. The HTML parser accepts it, so the
        pole is perfect while you draw; every export serialises the symbol to
        image/svg+xml, the parse fails, the Image fires onerror and the
        symbol is dropped in silence -- on the map and in the key, because
        both draw the same markup. It had never survived an export.

     2. + 3. "EVSE and EVSE2 will be mounted on a dual-port pedestal, while
        the remaining chargers will be wall-mounted. Can we show that
        distinction on the site map ... and make sure the legend clearly
        identifies which is which." There was no wall mount in the drawing
        at all; every charger drew as the same free-standing cabinet.

     4. "The [service pedestal] icon in the legend doesn't match the icon
        shown on the actual site map." renderEl draws a service flagged
        svcPedestal with ICONS.svcped; renderLegend keyed off the evKind,
        'service', and drew the utility-service glyph beside the words
        "Utility Service". One object, two symbols, same sheet.

   The functions are grabbed straight out of the page, as tsvcped.js does. */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const ED = fs.readFileSync(path.join(ROOT, 'editor.html'), 'utf8');

function bodyFrom(src, needle) {
  const hits = [];
  for (let k = src.indexOf(needle); k >= 0; k = src.indexOf(needle, k + 1)) hits.push(k);
  if (hits.length !== 1) throw new Error(needle + ' appears ' + hits.length + ' times');
  let k = src.indexOf('{', hits[0]), d = 0;
  for (;; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (!d) break; } }
  return src.slice(hits[0], k + 1);
}
function chk(l, ok, x = '') { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`); if (!ok) all = false; return ok; }
let all = true;

/* ── the icon table, evaluated out of the page ───────────────────────── */
const ICONSRC = (function () {
  const a = ED.indexOf('const ICONS={'), b = ED.indexOf('// == EQUIPMENT LIST', a);
  if (a < 0 || b < 0) throw new Error('ICONS is not in editor.html');
  return ED.slice(a, b);
})();
const ICONS = eval('(' + bodyFrom(ED, 'const ICONS={').replace(/^const ICONS=/, '') + ')');

/* ── 1. a symbol that cannot be serialised is a symbol that never exports ── */
console.log('\nevery equipment symbol survives being serialised for an export');
{
  /* XML forbids "--" inside a comment, full stop: the export hands the
     serialised symbol to an <img> as image/svg+xml, so this is fatal there
     and invisible everywhere else. */
  const offenders = [];
  Object.keys(ICONS).forEach(function (k) {
    if (typeof ICONS[k] !== 'function') return;
    let markup; try { markup = ICONS[k](60); } catch (e) { offenders.push(k + ' (threw)'); return; }
    if (typeof markup !== 'string') return;
    const comments = markup.match(/<!--[\s\S]*?-->/g) || [];
    comments.forEach(function (c) {
      if (/--/.test(c.slice(4, -3))) offenders.push(k + ': ' + c.trim().slice(0, 60));
    });
  });
  chk('no icon has a double hyphen inside an SVG comment', offenders.length === 0, offenders.join(' | '));
  chk('the utility pole still draws a pole (shaft, cross-arm, insulators)',
    /polygon/.test(ICONS.pole(60)) && /UTIL POLE/.test(ICONS.pole(60)));
  chk('and it is reachable under the id the drawing places it with',
    typeof ICONS.pole === 'function' && /rbInsert\('pole'\)/.test(ED));
  /* the export strips comments anyway, so one bad edit cannot do it again */
  chk('the export strips comment nodes before serialising a symbol',
    /NodeFilter\.SHOW_COMMENT/.test(ED) && /_dead\.forEach/.test(ED));
}

/* ── 2. mounting: the state ──────────────────────────────────────────── */
console.log('\na charger carries how it is mounted');
const OmegaEVMount = (function () {
  const open = 'var OmegaEVMount = (function(){';
  const close = 'try{ window.OmegaEVMount = OmegaEVMount; }catch(e){}';
  const a = ED.indexOf(open), b = ED.indexOf(close, a);
  if (a < 0 || b < 0) throw new Error('OmegaEVMount is not in editor.html');
  return eval('(' + ED.slice(a + 'var OmegaEVMount = '.length, b).trim().replace(/;$/, '') + ')');
})();
const wall = { type: 'evgear', evKind: 'charger', mount: 'wall' };
const ped = { type: 'evgear', evKind: 'charger' };
const dual = { type: 'evgear', evKind: 'charger', units: 2, pedestal: true };
const eqChg = { type: 'eq', eqId: 'charger' };
const notChg = { type: 'evgear', evKind: 'panel' };
{
  chk('a charger placed by a guided build is one', OmegaEVMount.isCharger(ped));
  chk('a charger placed from the Insert palette is one too', OmegaEVMount.isCharger(eqChg));
  chk('a switchgear is not', !OmegaEVMount.isCharger(notChg));
  /* an existing project has no mount field and must open drawn as it was */
  chk('with nothing stored it is a pedestal, so old projects are unchanged',
    OmegaEVMount.mountOf(ped) === 'pedestal' && OmegaEVMount.mountOf({}) === 'pedestal');
  chk('wall is honoured when stored', OmegaEVMount.mountOf(wall) === 'wall');
  chk('a bad value falls back rather than drawing nothing', OmegaEVMount.mountOf({ mount: 'ceiling' }) === 'pedestal');
  const t = {}; OmegaEVMount.setMount(t, 'wall');
  chk('setMount writes it', t.mount === 'wall');
  OmegaEVMount.setMount(t, 'anything else');
  chk('and never writes a value the renderer cannot draw', t.mount === 'pedestal');
  chk('a catalogue dual pedestal is recognised as one', OmegaEVMount.isDual(dual) && !OmegaEVMount.isDual(ped));
}

/* ── the symbol, told apart by FORM so it survives a B&W permit plot ──── */
console.log('\nthe site map draws the distinction');
{
  const w = OmegaEVMount.symbol('wall', 40, 52, false);
  const p = OmegaEVMount.symbol('pedestal', 40, 52, false);
  const d = OmegaEVMount.symbol('pedestal', 40, 52, true);
  chk('a wall mount and a pedestal are different drawings', w !== p);
  chk('the wall mount draws a hatched wall face with brackets', /<rect/.test(w) && (w.match(/<line/g) || []).length >= 3);
  chk('the pedestal draws a base plate with anchor bolts', /<rect/.test(p) && (p.match(/<circle/g) || []).length === 4);
  chk('a dual pedestal shows the one footing carrying two units', /stroke-dasharray/.test(d) && !/stroke-dasharray/.test(p));
  /* a permit set prints black on white and goes through a B&W plotter */
  const hues = s => Array.from(new Set((s.match(/#[0-9A-Fa-f]{3,6}/g) || [])));
  chk('the two forms use the same ink, so the distinction survives a B&W plot',
    JSON.stringify(hues(w).sort()) === JSON.stringify(hues(p).filter(h => hues(w).indexOf(h) >= 0).sort()));
  chk('both carry the class the export rasterises', /class="ev-mount"/.test(w) && /class="ev-mount"/.test(p));

  const ov = OmegaEVMount.overlay(Object.assign({ rot: 35 }, wall), 40, 52);
  chk('the overlay turns with the unit', /rotate\(35deg\)/.test(ov));
  chk('it is inert, so it never eats a click meant for the charger', /pointer-events:none/.test(ov));
  /* the rasteriser prefers the SVG's own declared offset over a measured
     rect, which for a rotated element is its rotated bounding box */
  chk('the offset is declared on the svg itself, where the export reads it',
    /^<svg style="position:absolute;left:-\d+px;top:-\d+px;/.test(ov));
  chk('it sits under the cabinet', /z-index:0/.test(ov));
  chk('nothing is drawn for something that is not a charger', OmegaEVMount.overlay(notChg, 40, 40) === '');
}

console.log('\nboth renderers draw it, so the two placement paths cannot drift');
{
  chk('the guided-build renderer draws the mount', /_evPad\+_evMount\+'<div class="elbody evgear-node"/.test(ED));
  chk('the palette renderer draws the mount', /\$\{_pad\}\$\{_eqMount\}<div class="elbody eq-node"/.test(ED));
  chk('both go through the one helper', (ED.match(/OmegaEVMount\.overlay\(el,/g) || []).length === 2);
  chk('the export rasterises the mount symbol as it does the bollard island',
    /querySelectorAll\('svg\.ev-mount'\)/.test(ED));
  chk('a charger offers the control in its own properties panel',
    /id='p-evmount-row'/.test(ED) && /data-mount="wall"/.test(ED) && /data-mount="pedestal"/.test(ED));
  chk('changing it redraws the chargers and the key', /OmegaEVMount\.refresh\(\);/.test(ED));
  /* saveProject() hands the elements over whole, so the field persists */
  chk('the field rides the save', /elements:  S\.elements,/.test(ED));
}

/* ── 3. the legend ───────────────────────────────────────────────────── */
console.log('\nthe legend says which chargers are which');
{
  chk('wall and pedestal are different legend keys',
    OmegaEVMount.key(wall) !== OmegaEVMount.key(ped));
  chk('a dual pedestal is its own key again', OmegaEVMount.key(dual) === 'dual');
  chk('each one is named in words a reviewer reads',
    OmegaEVMount.label('wall') === 'wall-mounted' &&
    OmegaEVMount.label('pedestal') === 'pedestal-mounted' &&
    OmegaEVMount.label('dual') === 'dual-port pedestal');
  chk('the legend keys a charger by its mounting', /id = id \+ '__mnt-' \+ OmegaEVMount\.key\(e\)/.test(ED));
  chk('and prints the mounting beside the model name',
    /label \+= '\\u2014 '/.test(ED.replace(/\s*\+\s*/g, '')) ||
    /if\(_mntK && window\.OmegaEVMount\) label \+=/.test(ED));
  chk('the key swatch is the map symbol, not a generic badge',
    /ico=OmegaEVMount\.swatch\(_mntK,16\)/.test(ED));

  const sw = OmegaEVMount.swatch('wall', 16);
  chk('the swatch is a real 16px symbol', /^<svg width="16" height="16"/.test(sw) && sw.length > 120);
  chk('the swatch shows the cabinet as well as the mount', /#37424f/.test(sw));
  chk('wall and pedestal swatches differ', OmegaEVMount.swatch('wall', 16) !== OmegaEVMount.swatch('pedestal', 16));

  /* markers stack: a future-proofed wall stall carries both. An anchored
     "__future$" test stopped matching as soon as a second marker followed
     it, and the row fell back to a raw id and a junction-box icon. */
  const strip = id => id.replace(/__mnt-[a-z]+/, '').replace(/__future/, '');
  chk('stacked markers still resolve to the catalogue id',
    strip('charger__future__mnt-wall') === 'charger' &&
    strip('charger__mnt-dual') === 'charger' &&
    strip('charger__future') === 'charger');
  chk('the page strips them the same way, in any order',
    /id\.replace\(\/__mnt-\[a-z\]\+\/,''\)\.replace\(\/__future\/,''\)/.test(ED.replace(/\s/g, '')));
  chk('the icon is resolved off the base id, never the marked one',
    /ICONS\[_base\]/.test(ED) && !/ICONS\[G\.id\]/.test(ED));
}

/* ── 4. one object, one symbol ───────────────────────────────────────── */
console.log('\nthe service pedestal wears one symbol on the whole sheet');
{
  /* the rule moved into omegaGearSymbol (§5), which is what renderEl now
     asks — so it is asserted there, on the one copy, not on renderEl */
  chk('a service flagged as a pedestal resolves to the pedestal symbol',
    /el\.evKind==='service' && el\.svcPedestal && ICO\.svcped/.test(ED));
  chk('the legend now keys it the same way',
    /if\(e\.type==='evgear' && e\.evKind==='service' && e\.svcPedestal\) id='svcped';/.test(ED));
  chk('so both resolve to the same drawing', typeof ICONS.svcped === 'function');
  chk('and to the same words, merging the two placement paths into one row',
    /\{id:'svcped',\s*label:'Service Pedestal'\}/.test(ED));
}

/* ── 5. one object, one symbol, for EVERY role ───────────────────────
   Menachem, 172 Summer St, 2026-10-29: "the outdoor panel disconnect is
   still not the same icon". The service pedestal above was the same fault
   one branch over, and fixing it there left the rest: renderEl ran a
   four-way branch to pick a symbol while renderLegend reached into ICONS
   by id, so EVERY guided-build role drew one thing on the plan and
   another in the key. Eleven roles, eleven mismatches; two were reported.
   The branch now lives in omegaGearSymbol and both callers ask it. */
console.log('\nthe key draws what the map drew, for every role');
{
  /* the real symbol tables and the real resolver, evaluated out of the page */
  var vis = fs.readFileSync(path.join(ROOT, 'omega-equipment-visuals.js'), 'utf8');
  var EVRENDER = (function () {
    var a = ED.indexOf('var EVRENDER = {'), b = ED.indexOf('/* Footprint (ft) for realistic scaling', a);
    return ED.slice(a, b);
  })();
  var GEAR = (function () {
    var open = 'function omegaGearSymbol(el, w, h){';
    var close = 'try{ window.omegaGearSymbol = omegaGearSymbol; }catch(e){}';
    var a = ED.indexOf(open), b = ED.indexOf(close, a);
    if (a < 0 || b < 0) throw new Error('omegaGearSymbol is not in editor.html');
    return ED.slice(a, b);
  })();
  var sandbox = { window: {}, console: console };
  sandbox.window.window = sandbox.window;
  /* omega-equipment-visuals.js is an IIFE that ends `})(window)`, so give
     it a window to hang OmegaEquipmentVisuals on rather than a root arg */
  new Function('window', vis)(sandbox.window);
  var run = new Function('window', 'OmegaEquipmentVisuals',
    ICONSRC + '\n' + EVRENDER + '\n' + GEAR + '\nreturn omegaGearSymbol;');
  var gearSymbol = run(sandbox.window, sandbox.window.OmegaEquipmentVisuals);

  function art(s) { return String(s).replace(/\s(?:width|height)="[^"]*"/g, ''); }
  var ROLES = [
    ['outdoor panel', { type: 'evgear', evKind: 'panel', label: 'Outdoor Panel / Disconnect' }],
    ['switchgear', { type: 'evgear', evKind: 'panel', label: 'Main Switchgear' }],
    ['meter bank', { type: 'evgear', evKind: 'meter' }],
    ['utility service', { type: 'evgear', evKind: 'service' }],
    ['service pedestal', { type: 'evgear', evKind: 'service', svcPedestal: true }],
    ['transformer', { type: 'evgear', evKind: 'xfmr' }],
    ['disconnect', { type: 'evgear', evKind: 'disco' }],
    ['bess', { type: 'evgear', evKind: 'bess' }],
    ['charger', { type: 'evgear', evKind: 'charger' }],
    ['unknown role', { type: 'evgear', evKind: 'nosuchthing' }]
  ];
  var bad = [], blank = [];
  ROLES.forEach(function (r) {
    var onMap = gearSymbol(r[1], 60, 78), inKey = gearSymbol(r[1], 16, 16);
    if (art(onMap) !== art(inKey)) bad.push(r[0]);
    if (!onMap || onMap.length < 20) blank.push(r[0]);
  });
  chk('every role draws the same artwork at map size and at key size', bad.length === 0, bad.join(', '));
  chk('and no role comes back blank', blank.length === 0, blank.join(', '));

  /* the specific report: the outdoor panel is the catalogue cabinet, which
     is NOT what ICONS.panel draws */
  var panelSym = gearSymbol({ type: 'evgear', evKind: 'panel', label: 'Outdoor Panel / Disconnect' }, 16, 16);
  chk("the outdoor panel is the catalogue's cabinet, not the ICONS badge",
    art(panelSym) !== art(ICONS.panel(16)));
  chk('a service pedestal still wears the pedestal symbol',
    art(gearSymbol({ type: 'evgear', evKind: 'service', svcPedestal: true }, 16, 16)) === art(ICONS.svcped(16)));
  chk('a plain service still wears the meter, not the pedestal',
    art(gearSymbol({ type: 'evgear', evKind: 'service' }, 16, 16)) !== art(ICONS.svcped(16)));
  chk("a charger with a product photo is drawn as that photo",
    /<img/.test(gearSymbol({ type: 'evgear', evKind: 'charger', evImg: 'data:image/png;base64,AA' }, 16, 16)));

  /* both call sites go through the one function, and nowhere else */
  chk('renderEl asks it', /var _gearHtml=omegaGearSymbol\(el,gw,gh\);/.test(ED));
  chk('renderLegend asks it', /ico=omegaGearSymbol\(_rel,16,16\)/.test(ED));
  chk('the legend keeps the element each row stands for', /if\(!_rowEl\[id\]\) _rowEl\[id\]=e;/.test(ED));
  chk('the old four-way branch is gone from renderEl',
    !/_gearHtml=_visuals\.symbol\(_gearKind,gw,gh\)/.test(ED));
  chk('a charger still keeps its mounting swatch in the key',
    /if\(_mntK && window\.OmegaEVMount\) ico=OmegaEVMount\.swatch/.test(ED));
  chk('palette equipment still falls through to ICONS, which is what renderEl draws for it',
    /else ico=\(\(typeof ICONS!=='undefined' && ICONS\[_base\]\)/.test(ED));
}

console.log('\n' + (all ? 'OK  tevmount' : 'FAILED  tevmount') + '\n');
process.exit(all ? 0 : 1);
