/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   omega-hexhub.js — the HEX HUB: Omega Logic's home, drawn from its icon.
   Seven cells in a honeycomb, the way the Ω holds seven lit cells in the app
   icon (icons/omega-logic.svg): one in the middle, six around it. Each cell
   is a hub of the business; tapping one opens it. The Omega Logic app, the
   customer app and both desktops draw their home with this ONE component,
   so the four surfaces look like one product.

     OmegaHexHub.render(el, {
       items: [ { key, label, icon, badge, hint } × up to 7 ],  // [0] is the centre
       onPick: function (key) {},
       title: 'Where to?',              // optional heading inside the tile
       caption: 'Clean Cell'            // optional line under the heading
     })

   ES5, no build step, no dependencies. Keyboard: every cell is a button
   (Tab, Enter, Space). Colours are the icon's; the tile is dark on every
   theme, so a tenant's colours never repaint the hub (Omega Logic is
   ClearSky's product). The customer app passes its own items — the hub is
   the shape, the words are the surface's. */
(function () {
  'use strict';
  var CSS = '.hexhub{position:relative;border-radius:22px;padding:14px 10px 8px;margin:6px 0 14px;overflow:hidden;color:#EAF7FB;'
    + 'background:radial-gradient(120% 90% at 50% 38%,#17293A 0%,#0C1824 55%,#050A11 100%);box-shadow:0 10px 30px rgba(5,10,17,.28)}'
    + '.hexhub h2,.hexhub .hh-cap{position:relative;margin:2px 8px;text-align:center}.hexhub h2{font:700 20px Poppins,system-ui,sans-serif;letter-spacing:-.2px;color:#fff;border:0;padding:0}'
    + '.hexhub .hh-cap{font:500 12px system-ui,sans-serif;color:#8FB3C2}'
    + '.hexhub svg{display:block;width:100%;height:auto;max-width:430px;margin:0 auto;position:relative}'
    + '.hexhub .hx{cursor:pointer;outline:none}.hexhub .hx .cell{fill:url(#hh-fill);stroke:url(#hh-neon);stroke-width:2.6;transition:fill .15s}'
    + '.hexhub .hx .halo{fill:none;stroke:url(#hh-neon);stroke-width:7;opacity:.28;filter:url(#hh-blur)}'
    + '.hexhub .hx:hover .cell,.hexhub .hx:focus .cell{fill:url(#hh-fill-on)}.hexhub .hx:focus .halo,.hexhub .hx:hover .halo{opacity:.6}'
    + '.hexhub .hx.center .cell{stroke-width:3.2}.hexhub .hx .ic{font:600 23px system-ui,"Segoe UI Symbol",sans-serif;fill:#9FE9F2;text-anchor:middle}'
    + '.hexhub .hx .lb{font:700 12.5px system-ui,sans-serif;fill:#F2FBFD;text-anchor:middle}.hexhub .hx .ht{font:500 10px system-ui,sans-serif;fill:#8FB3C2;text-anchor:middle}'
    + '.hexhub .hx .bd{fill:#EE5A4F}.hexhub .hx .bt{font:700 11px system-ui,sans-serif;fill:#fff;text-anchor:middle}'
    + '.hexhub .bg{fill:none;stroke:#2FE3C8;stroke-opacity:.07;stroke-width:1}';
  function injectCss() {
    if (document.getElementById('omega-hexhub-css')) return;
    var s = document.createElement('style'); s.id = 'omega-hexhub-css'; s.textContent = CSS; (document.head || document.documentElement).appendChild(s);
  }
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  /* a pointy-top hexagon of radius r centred on (x, y) */
  function hex(x, y, r) {
    var pts = [];
    for (var i = 0; i < 6; i++) { var a = Math.PI / 180 * (60 * i - 90); pts.push((x + r * Math.cos(a)).toFixed(1) + ',' + (y + r * Math.sin(a)).toFixed(1)); }
    return pts.join(' ');
  }
  /* reading order around the centre: top-left, top-right, right,
     bottom-right, bottom-left, left */
  var RING = [[-0.5, -1], [0.5, -1], [1, 0], [0.5, 1], [-0.5, 1], [-1, 0]];
  function render(el, opts) {
    if (!el) return;
    injectCss(); opts = opts || {};
    var items = (opts.items || []).slice(0, 7), R = 62, gap = 5, W = Math.sqrt(3) * (R + gap), H = 1.5 * (R + gap);
    var cx = 1.5 * W + 4, cy = R + H + 6, vw = cx * 2, vh = cy * 2;
    var bg = '', i, j;
    for (i = -3; i <= 3; i++) for (j = -3; j <= 3; j++) {
      var bx = cx + (j + (i % 2 ? 0.5 : 0)) * W, by = cy + i * H;
      bg += '<polygon class="bg" points="' + hex(bx, by, R + gap - 2) + '"/>';
    }
    var cells = items.map(function (it, n) {
      var p = n === 0 ? [0, 0] : RING[n - 1], x = cx + p[0] * W, y = cy + p[1] * H;
      var label = esc(it.label), badge = it.badge ? String(it.badge).slice(0, 4) : '';
      return '<g class="hx' + (n === 0 ? ' center' : '') + '" role="button" tabindex="0" data-hub="' + esc(it.key) + '" aria-label="' + label + (badge ? ', ' + esc(badge) : '') + '">'
        + '<polygon class="halo" points="' + hex(x, y, R) + '"/><polygon class="cell" points="' + hex(x, y, R) + '"/>'
        + '<text class="ic" x="' + x.toFixed(1) + '" y="' + (y - 6).toFixed(1) + '">' + esc(it.icon || '') + '</text>'
        + '<text class="lb" x="' + x.toFixed(1) + '" y="' + (y + 17).toFixed(1) + '">' + label + '</text>'
        + (it.hint ? '<text class="ht" x="' + x.toFixed(1) + '" y="' + (y + 32).toFixed(1) + '">' + esc(String(it.hint).slice(0, 22)) + '</text>' : '')
        + (badge ? '<circle class="bd" cx="' + (x + R * 0.55).toFixed(1) + '" cy="' + (y - R * 0.62).toFixed(1) + '" r="12"/><text class="bt" x="' + (x + R * 0.55).toFixed(1) + '" y="' + (y - R * 0.62 + 4).toFixed(1) + '">' + esc(badge) + '</text>' : '')
        + '</g>';
    }).join('');
    el.innerHTML = '<div class="hexhub">' + (opts.title ? '<h2>' + esc(opts.title) + '</h2>' : '') + (opts.caption ? '<div class="hh-cap">' + esc(opts.caption) + '</div>' : '')
      + '<svg viewBox="0 0 ' + vw.toFixed(0) + ' ' + vh.toFixed(0) + '" role="group" aria-label="' + esc(opts.title || 'Hubs') + '">'
      + '<defs><linearGradient id="hh-neon" x1="0" y1="0" x2="' + vw.toFixed(0) + '" y2="0" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#9BE870"/><stop offset=".32" stop-color="#2FE3C8"/><stop offset=".68" stop-color="#35C6F4"/><stop offset="1" stop-color="#3D9DF5"/></linearGradient>'
      + '<radialGradient id="hh-fill" cx=".5" cy=".4" r=".7"><stop offset="0" stop-color="#1B3448"/><stop offset="1" stop-color="#0E1D2B"/></radialGradient>'
      + '<radialGradient id="hh-fill-on" cx=".5" cy=".4" r=".7"><stop offset="0" stop-color="#23506A"/><stop offset="1" stop-color="#12304A"/></radialGradient>'
      + '<filter id="hh-blur" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="4"/></filter></defs>'
      + bg + cells + '</svg></div>';
    Array.prototype.forEach.call(el.querySelectorAll('.hx'), function (g) {
      function go(e) { if (e) e.preventDefault(); if (typeof opts.onPick === 'function') opts.onPick(g.getAttribute('data-hub')); }
      g.addEventListener('click', go);
      g.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') go(e); });
    });
  }
  window.OmegaHexHub = { render: render };
})();
