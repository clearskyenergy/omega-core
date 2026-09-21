/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
(function () {
  'use strict';
  window.OmegaLogicTheme = { apply: function (brand) {
    brand = brand || {}; var style = document.documentElement.style;
    [['primary','--brand'],['primary','--cta'],['primary','--green'],['primary','--brand-d'],['accent','--accent'],['ink','--ink']].forEach(function (p) {
      if (/^#[0-9a-f]{6}$/i.test(brand[p[0]] || '')) style.setProperty(p[1], brand[p[0]]);
    });
    if (/^#[0-9a-f]{6}$/i.test(brand.primary || '')) {
      var rgb=[1,3,5].map(function(i){return parseInt(brand.primary.slice(i,i+2),16);}).join(',');
      style.setProperty('--brand-soft','rgba('+rgb+',0.13)');
    }
    document.body.classList.add('logic-theme');
    Array.prototype.forEach.call(document.querySelectorAll('[data-brand-name]'), function (e) { e.textContent = brand.name || 'Customer portal'; });
  } };
})();
