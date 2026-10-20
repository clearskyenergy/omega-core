/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 *
 * Slots the Site Plan shell leaves open for work that is not this page:
 * the 3D view, the permit plan set, the single-line, and funding.
 * A listener registers. The button calls invoke. Showing the button is
 * not the feature.
 */
(function (root) {
  'use strict';

  var NAMES = ['view3d', 'permit', 'sld', 'funding'];
  var slots = {};

  function known(name) {
    var i;
    for (i = 0; i < NAMES.length; i++) if (NAMES[i] === name) return true;
    return false;
  }
  function register(name, fn) {
    if (!known(name) || typeof fn !== 'function') return false;
    if (!slots[name]) slots[name] = [];
    slots[name].push(fn);
    return true;
  }
  function invoke(name, ctx) {
    var list = slots[name] || [], i, answered = false;
    if (!list.length) return false;
    for (i = 0; i < list.length; i++) {
      try { if (list[i](ctx || {}) !== false) answered = true; }
      catch (e) { /* a listener's error does not pretend the slot is empty */ answered = true; }
    }
    return answered;
  }
  function listeners(name) { return (slots[name] || []).length; }

  var api = { register: register, invoke: invoke, listeners: listeners, names: function () { return NAMES.slice(); }, VERSION: 'editor-v2-hooks/1' };
  root.OmegaEditorV2Hooks = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : global);
