/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 *
 * omega-editor-v2-icons.js — equipment drawn as what it is, from above.
 *
 * View › Icons (Tommy, 2026-10-20: "a toggle in view that allows us to do
 * icons on the items like for instance the bess … should be a bess
 * container"). Each piece keeps its own box, size and rotation; the icon is
 * drawn inside that box in plan, the way the piece looks from above: the
 * BESS a container (the ribbed roof, the doors at one end, the cooling unit
 * on the roof), a transformer's fins and coils, switchgear's sections, a
 * charger's pedestal. Off, every piece is its outline, as before.
 *
 * draw(ctx, e, centre, pxPerFt) paints into the editor's canvas and says
 * whether it did (a box too small on screen keeps its plain fill); kindOf(e)
 * is the one map from an equipment key to an icon.
 */
(function (root) {
  'use strict';
  var INK = '#2E4256', SOFT = 'rgba(46,66,86,.38)';
  var KIND = {
    bess: 'bess', battery: 'bess', pcs: 'pcs', inverter: 'pcs', transformer: 'transformer', xfmr: 'transformer',
    panel: 'panel', switchgear: 'panel', disco: 'disco', meter: 'meter', poi: 'poi', charger: 'charger',
    ems: 'ems', ups: 'ups', racks: 'racks', cooling: 'cooling', genset: 'genset', fuelcell: 'fuelcell',
    substation: 'substation', pv: 'pv'
  };
  function kindOf(e) {
    var k = String((e && e.key) || '').toLowerCase();
    if (KIND[k]) return KIND[k];
    var l = String((e && e.label) || '').toLowerCase();
    if (/bess|battery/.test(l)) return 'bess';
    if (/transformer/.test(l)) return 'transformer';
    if (/switchgear|panel/.test(l)) return 'panel';
    if (/dcfc|charger|level 2/.test(l)) return 'charger';
    if (/disconnect/.test(l)) return 'disco';
    if (/meter/.test(l)) return 'meter';
    if (/interconnection|point of connection/.test(l)) return 'poi';
    if (/inverter|pcs/.test(l)) return 'pcs';
    return 'other';
  }

  /* ── drawing in the box's own feet: x along its width, y up its depth ── */
  function rect(ctx, x0, y0, x1, y1) { ctx.beginPath(); ctx.rect(x0, y0, x1 - x0, y1 - y0); }
  function line(ctx, x0, y0, x1, y1) { ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); }
  function circle(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); }
  function body(ctx, w, h, fill, px) {
    rect(ctx, -w / 2, -h / 2, w / 2, h / 2);
    ctx.fillStyle = fill; ctx.fill();
    ctx.lineWidth = 1.2 * px; ctx.strokeStyle = INK; ctx.stroke();
  }
  /* a lightning bolt in a box of size s around (x, y) */
  function bolt(ctx, x, y, s, fill) {
    var p = [[0.1, 0.5], [-0.25, -0.05], [-0.02, -0.05], [-0.12, -0.5], [0.25, 0.08], [0.02, 0.08]];
    ctx.beginPath();
    for (var i = 0; i < p.length; i++) { if (i) ctx.lineTo(x + p[i][0] * s, y + p[i][1] * s); else ctx.moveTo(x + p[i][0] * s, y + p[i][1] * s); }
    ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
  }

  var PAINT = {
    /* a container: ribbed roof, the doors at one end, the cooling unit on the roof */
    bess: function (ctx, L, D, px) {
      body(ctx, L, D, '#DCE3E9', px);
      var door = Math.min(L * 0.09, 3), hv = Math.min(L * 0.16, D * 0.95, 6), step = Math.max(L / 26, 0.8), x;
      ctx.lineWidth = px; ctx.strokeStyle = SOFT;
      for (x = -L / 2 + hv + 0.08 * L; x < L / 2 - door - step * 0.4; x += step) line(ctx, x, -D / 2 + 0.1 * D, x, D / 2 - 0.1 * D);
      /* the doors: two leaves, their locking bars */
      rect(ctx, L / 2 - door, -D / 2, L / 2, D / 2); ctx.fillStyle = '#C9D3DB'; ctx.fill();
      ctx.lineWidth = 1.1 * px; ctx.strokeStyle = INK; ctx.stroke();
      line(ctx, L / 2 - door, 0, L / 2, 0);
      ctx.lineWidth = px; ctx.strokeStyle = SOFT;
      line(ctx, L / 2 - door * 0.55, -D / 2 + D * 0.12, L / 2 - door * 0.55, -D * 0.06);
      line(ctx, L / 2 - door * 0.55, D * 0.06, L / 2 - door * 0.55, D / 2 - D * 0.12);
      /* the cooling unit on the roof, its fan */
      var cx = -L / 2 + 0.05 * L + hv / 2, r = Math.min(hv, D * 0.7) * 0.32;
      rect(ctx, cx - hv / 2, -Math.min(hv, D * 0.8) / 2, cx + hv / 2, Math.min(hv, D * 0.8) / 2);
      ctx.fillStyle = '#9AA8B5'; ctx.fill(); ctx.lineWidth = px; ctx.strokeStyle = INK; ctx.stroke();
      circle(ctx, cx, 0, r); ctx.fillStyle = '#6C7B89'; ctx.fill(); ctx.stroke();
      line(ctx, cx - r * 0.7, -r * 0.7, cx + r * 0.7, r * 0.7); line(ctx, cx - r * 0.7, r * 0.7, cx + r * 0.7, -r * 0.7);
      /* a green cell mark: what is inside */
      var bw = Math.min(L * 0.1, D * 0.5), bh = bw * 0.55, bx = (L / 2 - door) - bw * 1.6;
      rect(ctx, bx - bw / 2, -bh / 2, bx + bw / 2, bh / 2); ctx.fillStyle = '#3C9A64'; ctx.fill();
      rect(ctx, bx + bw / 2, -bh * 0.22, bx + bw / 2 + bw * 0.12, bh * 0.22); ctx.fill();
    },
    /* an inverter: DC on one side of the diagonal, AC on the other */
    pcs: function (ctx, L, D, px) {
      body(ctx, L, D, '#E9E3D1', px);
      var s = Math.min(L, D) * 0.8;
      rect(ctx, -s / 2, -s / 2, s / 2, s / 2); ctx.lineWidth = px; ctx.strokeStyle = INK; ctx.stroke();
      line(ctx, -s / 2, -s / 2, s / 2, s / 2);
      line(ctx, -s * 0.36, s * 0.24, -s * 0.08, s * 0.24); line(ctx, -s * 0.36, s * 0.12, -s * 0.08, s * 0.12);
      ctx.beginPath();
      for (var i = 0; i <= 12; i++) { var t = i / 12, x = s * 0.06 + t * s * 0.32, y = -s * 0.2 + Math.sin(t * Math.PI * 2) * s * 0.07; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
      ctx.stroke();
    },
    /* a pad-mounted transformer: fins on two sides, the two coils */
    transformer: function (ctx, L, D, px) {
      body(ctx, L, D, '#CDD8CF', px);
      var n = 6, i, y;
      ctx.lineWidth = px; ctx.strokeStyle = SOFT;
      for (i = 0; i < n; i++) {
        y = -D / 2 + D * (i + 0.5) / n;
        line(ctx, -L / 2, y, -L / 2 + L * 0.14, y); line(ctx, L / 2 - L * 0.14, y, L / 2, y);
      }
      var r = Math.min(L, D) * 0.2;
      ctx.lineWidth = 1.2 * px; ctx.strokeStyle = INK;
      circle(ctx, -r * 0.62, 0, r); ctx.stroke(); circle(ctx, r * 0.62, 0, r); ctx.stroke();
    },
    /* switchgear: a line-up of sections, a handle on each */
    panel: function (ctx, L, D, px) {
      body(ctx, L, D, '#E3E7EB', px);
      var n = Math.max(2, Math.min(8, Math.round(L / 2.5))), i, x;
      ctx.lineWidth = px; ctx.strokeStyle = INK;
      for (i = 1; i < n; i++) { x = -L / 2 + L * i / n; line(ctx, x, -D / 2, x, D / 2); }
      ctx.strokeStyle = SOFT;
      for (i = 0; i < n; i++) { x = -L / 2 + L * (i + 0.8) / n; line(ctx, x, -D * 0.18, x, D * 0.18); }
      rect(ctx, -L / 2, -D / 2, L / 2, -D / 2 + D * 0.12); ctx.fillStyle = '#F2C94C'; ctx.fill();
    },
    /* a disconnect: two terminals and the open blade */
    disco: function (ctx, L, D, px) {
      body(ctx, L, D, '#EDEDED', px);
      var a = -L * 0.3, b = L * 0.3, r = Math.min(L, D) * 0.08;
      ctx.lineWidth = 1.2 * px; ctx.strokeStyle = INK; ctx.fillStyle = INK;
      line(ctx, -L / 2, 0, a, 0); line(ctx, b, 0, L / 2, 0);
      line(ctx, a, 0, b * 0.85, D * 0.3);
      circle(ctx, a, 0, r); ctx.fill(); circle(ctx, b, 0, r); ctx.fill();
    },
    /* a meter: the dial and its needle */
    meter: function (ctx, L, D, px) {
      body(ctx, L, D, '#F3F3F1', px);
      var r = Math.min(L, D) * 0.36;
      circle(ctx, 0, 0, r); ctx.fillStyle = '#FFFFFF'; ctx.fill(); ctx.lineWidth = 1.2 * px; ctx.strokeStyle = INK; ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, r * 0.7, Math.PI * 0.15, Math.PI * 0.85); ctx.lineWidth = px; ctx.strokeStyle = SOFT; ctx.stroke();
      ctx.lineWidth = 1.2 * px; ctx.strokeStyle = '#C0392B'; line(ctx, 0, 0, r * 0.45, r * 0.5);
    },
    /* the point of interconnection: the utility's pole, its cross-arm, the bolt */
    poi: function (ctx, L, D, px) {
      body(ctx, L, D, '#F6EED8', px);
      var s = Math.min(L, D);
      ctx.lineWidth = 1.4 * px; ctx.strokeStyle = INK;
      line(ctx, -L * 0.38, 0, L * 0.38, 0);
      circle(ctx, 0, 0, s * 0.16); ctx.fillStyle = '#8A6A45'; ctx.fill(); ctx.stroke();
      bolt(ctx, L * 0.28, D * 0.22, s * 0.42, '#E2A400');
    },
    /* a charger: the pedestal, its screen, the bolt */
    charger: function (ctx, L, D, px) {
      body(ctx, L, D, '#DDEFE6', px);
      var s = Math.min(L, D);
      rect(ctx, -L * 0.36, D * 0.18, L * 0.36, D * 0.38); ctx.fillStyle = '#20333F'; ctx.fill();
      bolt(ctx, 0, -D * 0.08, s * 0.62, '#1E8E5A');
    },
    /* the energy management cabinet: its readout */
    ems: function (ctx, L, D, px) {
      body(ctx, L, D, '#E6E3F0', px);
      var w = L * 0.14, i, hs = [0.35, 0.6, 0.85];
      for (i = 0; i < 3; i++) { rect(ctx, -L * 0.3 + i * w * 1.6, -D * 0.35, -L * 0.3 + i * w * 1.6 + w, -D * 0.35 + D * 0.7 * hs[i]); ctx.fillStyle = '#5B4FA0'; ctx.fill(); }
    },
    /* a UPS: the battery inside */
    ups: function (ctx, L, D, px) {
      body(ctx, L, D, '#E4EDF2', px);
      var bw = Math.min(L * 0.5, D * 1.2), bh = Math.min(D * 0.5, bw * 0.55);
      rect(ctx, -bw / 2, -bh / 2, bw / 2, bh / 2); ctx.lineWidth = 1.2 * px; ctx.strokeStyle = INK; ctx.stroke();
      rect(ctx, bw / 2, -bh * 0.2, bw / 2 + bw * 0.1, bh * 0.2); ctx.fillStyle = INK; ctx.fill();
      rect(ctx, -bw / 2 + bw * 0.08, -bh / 2 + bh * 0.18, -bw / 2 + bw * 0.08 + bw * 0.5, bh / 2 - bh * 0.18); ctx.fillStyle = '#3C9A64'; ctx.fill();
    },
    /* compute: the rows of racks and their aisles */
    racks: function (ctx, L, D, px) {
      body(ctx, L, D, '#E8E9EF', px);
      var n = Math.max(2, Math.min(10, Math.round(D / 4))), i, y0, rh = D / n;
      for (i = 0; i < n; i += 2) { y0 = -D / 2 + i * rh; rect(ctx, -L / 2 + L * 0.04, y0 + rh * 0.15, L / 2 - L * 0.04, y0 + rh * 0.85); ctx.fillStyle = '#3B4656'; ctx.fill(); }
    },
    /* cooling: the fans */
    cooling: function (ctx, L, D, px) {
      body(ctx, L, D, '#E1EDF5', px);
      var n = Math.max(1, Math.min(4, Math.round(L / D))), r = Math.min(L / n, D) * 0.34, i, x;
      ctx.lineWidth = px; ctx.strokeStyle = INK;
      for (i = 0; i < n; i++) {
        x = -L / 2 + L * (i + 0.5) / n;
        circle(ctx, x, 0, r); ctx.fillStyle = '#B9CCDB'; ctx.fill(); ctx.stroke();
        line(ctx, x - r * 0.7, -r * 0.7, x + r * 0.7, r * 0.7); line(ctx, x - r * 0.7, r * 0.7, x + r * 0.7, -r * 0.7);
      }
    },
    /* a generator: the engine, its radiator, the exhaust */
    genset: function (ctx, L, D, px) {
      body(ctx, L, D, '#EFE5D3', px);
      rect(ctx, -L * 0.3, -D * 0.3, L * 0.2, D * 0.3); ctx.fillStyle = '#B4A386'; ctx.fill();
      ctx.lineWidth = px; ctx.strokeStyle = SOFT;
      for (var i = 0; i < 5; i++) line(ctx, L * 0.28 + i * L * 0.04, -D * 0.35, L * 0.28 + i * L * 0.04, D * 0.35);
      circle(ctx, -L * 0.4, D * 0.3, Math.min(L, D) * 0.08); ctx.fillStyle = '#4A4A4A'; ctx.fill();
    },
    /* a fuel cell: its stack of plates */
    fuelcell: function (ctx, L, D, px) {
      body(ctx, L, D, '#E2EFF2', px);
      ctx.lineWidth = px; ctx.strokeStyle = INK;
      for (var i = 0; i < 7; i++) line(ctx, -L * 0.3 + i * L * 0.1, -D * 0.3, -L * 0.3 + i * L * 0.1, D * 0.3);
    },
    /* a substation: its fence, the bus and two transformers */
    substation: function (ctx, L, D, px) {
      body(ctx, L, D, '#ECEFE9', px);
      ctx.setLineDash([4 * px, 3 * px]); rect(ctx, -L * 0.45, -D * 0.45, L * 0.45, D * 0.45); ctx.lineWidth = px; ctx.strokeStyle = INK; ctx.stroke(); ctx.setLineDash([]);
      line(ctx, -L * 0.35, D * 0.25, L * 0.35, D * 0.25);
      var r = Math.min(L, D) * 0.12;
      circle(ctx, -L * 0.18, -D * 0.05, r); ctx.stroke(); circle(ctx, L * 0.18, -D * 0.05, r); ctx.stroke();
    },
    /* solar: the module grid */
    pv: function (ctx, L, D, px) {
      body(ctx, L, D, '#2B4A6F', px);
      ctx.lineWidth = px; ctx.strokeStyle = 'rgba(255,255,255,.55)';
      var nx = Math.max(2, Math.round(L / 3.3)), ny = Math.max(1, Math.round(D / 5.5)), i;
      for (i = 1; i < nx; i++) line(ctx, -L / 2 + L * i / nx, -D / 2, -L / 2 + L * i / nx, D / 2);
      for (i = 1; i < ny; i++) line(ctx, -L / 2, -D / 2 + D * i / ny, L / 2, -D / 2 + D * i / ny);
    },
    other: function (ctx, L, D, px) {
      body(ctx, L, D, '#E7EBEF', px);
      bolt(ctx, 0, 0, Math.min(L, D) * 0.7, '#5A6B7C');
    }
  };

  /* Paint e's icon into its box. False when the box is too small on screen. */
  function draw(ctx, e, centre, pxPerFt) {
    var w = +e.w || 0, h = +e.h || 0, k = +pxPerFt || 0;
    if (!(w > 0 && h > 0 && k > 0) || Math.min(w, h) * k < 6) return false;
    var kind = kindOf(e), paint = PAINT[kind] || PAINT.other, long = w >= h;
    ctx.save();
    ctx.translate(centre.x, centre.y);
    ctx.rotate(-(+e.rot || 0) * Math.PI / 180);
    ctx.scale(k, -k);
    /* a container, a line-up and a pedestal are drawn along their long side */
    if (!long) ctx.rotate(Math.PI / 2);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    try { paint(ctx, long ? w : h, long ? h : w, 1 / k); } finally { ctx.restore(); }
    return true;
  }

  root.OmegaEditorV2Icons = { draw: draw, kindOf: kindOf, KINDS: Object.keys(PAINT), VERSION: 'editor-v2-icons/1' };
})(typeof window !== 'undefined' ? window : global);
