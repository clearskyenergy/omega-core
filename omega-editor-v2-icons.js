/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 *
 * omega-editor-v2-icons.js — each unit's icon on the drawing (View › Icons).
 *
 * Tommy, 2026-10-21: "it places like these boxes but we need a function that
 * puts the icons or images of the units like we had in the first editor".
 * The box stays the unit's true footprint; on the middle of it goes the
 * unit's icon, Site Map's own picture (omega-equipment-icons.js, read out of
 * editor.html's ICONS by scripts/build-equipment-icons.js): the BESS's
 * battery cabinets, the transformer, the charger, the utility pole. It is the
 * size of the box on screen, never under 22 px or over 72 px, and stays
 * upright as Site Map's do. iconOf(e) is the ONE map from a Maximus
 * equipment key to a Site Map icon. Off, every unit is its outline.
 */
(function (root) {
  'use strict';
  var MIN = 22, MAX = 72, RES = 128;
  var ICON = {
    bess: 'bess', battery: 'bess', pcs: 'pcs', inverter: 'inverter', transformer: 'xfmr', xfmr: 'xfmr',
    panel: 'panel', switchgear: 'panel', disco: 'disco', meter: 'meter', poi: 'util_poi', charger: 'charger',
    ems: 'ems', ups: 'ups', racks: 'dc_triton', cooling: 'cooling', genset: 'genset', fuelcell: 'fuelcell',
    substation: 'substation', pv: 'solar', sst: 'sst', acblock: 'acblock', jbox: 'jbox'
  };
  function lib() { return (root.OmegaEquipmentIcons && root.OmegaEquipmentIcons.SVG) || {}; }
  /* the Site Map icon for a unit: its key, else its name, else a junction box */
  function iconOf(e) {
    var k = String((e && e.key) || '').toLowerCase(), l = String((e && e.label) || '').toLowerCase(), id = ICON[k];
    if (!id) {
      if (/bess|battery/.test(l)) id = 'bess';
      else if (/transformer/.test(l)) id = 'xfmr';
      else if (/switchgear|panel/.test(l)) id = 'panel';
      else if (/dcfc|charger|level 2/.test(l)) id = 'charger';
      else if (/disconnect/.test(l)) id = 'disco';
      else if (/meter/.test(l)) id = 'meter';
      else if (/interconnection|point of connection/.test(l)) id = 'util_poi';
      else if (/inverter|pcs/.test(l)) id = 'pcs';
    }
    return id && lib()[id] ? id : 'jbox';
  }
  /* the icon's size on screen for a unit's box */
  function size(e, pxPerFt) {
    var s = Math.min((+e.w || 0) * pxPerFt, (+e.h || 0) * pxPerFt);
    return Math.max(MIN, Math.min(MAX, s));
  }
  var cache = {};
  function image(id, onReady) {
    var c = cache[id];
    if (c) { if (!c.ready && onReady) c.wait.push(onReady); return c; }
    var svg = lib()[id], Img = root.Image;
    if (!svg || typeof Img !== 'function') return null;
    c = cache[id] = { ready: false, failed: false, img: new Img(), wait: onReady ? [onReady] : [] };
    c.img.onload = function () { c.ready = true; var w = c.wait; c.wait = []; for (var i = 0; i < w.length; i++) { try { w[i](); } catch (err) { /* the caller's */ } } };
    c.img.onerror = function () { c.failed = true; };
    c.img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg.replace(/^<svg width="\d+" height="\d+"/, '<svg width="' + RES + '" height="' + RES + '"'));
    return c;
  }
  /* Paint e's icon on the middle of its box. False until the picture has
     loaded (onReady is called then) or when the unit has no size. */
  function draw(ctx, e, centre, pxPerFt, onReady) {
    if (!(+e.w > 0 && +e.h > 0 && pxPerFt > 0)) return false;
    var c = image(iconOf(e), onReady);
    if (!c || !c.ready) return false;
    var s = size(e, pxPerFt);
    ctx.drawImage(c.img, centre.x - s / 2, centre.y - s / 2, s, s);
    return true;
  }

  root.OmegaEditorV2Icons = { draw: draw, iconOf: iconOf, size: size, MIN: MIN, MAX: MAX, VERSION: 'editor-v2-icons/2' };
})(typeof window !== 'undefined' ? window : global);
