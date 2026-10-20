/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 *
 * omega-editor-v2-sld.js — single-line layout.
 *
 * Orthogonal wires, IEEE/ANSI-style symbols, labels kept off the symbols.
 * The electrical model decides what is on the diagram. This file only
 * places it. Y grows downward, in inches, so a sheet and a preview share it.
 */
(function (root) {
  'use strict';

  function textWidth(text, pt) {
    return String(text || '').length * (pt / 72) * 0.52;
  }

  function symbolSize(kind) {
    if (kind === 'utility' || kind === 'meter') return { hw: 0.18, hh: 0.18 };
    if (kind === 'breaker') return { hw: 0.13, hh: 0.16 };
    if (kind === 'disco') return { hw: 0.14, hh: 0.16 };
    if (kind === 'transformer') return { hw: 0.20, hh: 0.32 };
    if (kind === 'ground') return { hw: 0.16, hh: 0.14 };
    return { hw: 0.42, hh: 0.20 };
  }

  function layout(model, maxW, maxH) {
    model = model || { spine: [], branches: [], bus: { label: '' } };
    var pt = 8;
    var pitch = 0.78;
    var spine = model.spine || [];
    var branches = model.branches || [];
    var i, j, item, sz, colW, cols = [], spineW, totalW, branchH, spineH, height, scale;

    function colWidth(items) {
      var w = 1.8, k, s, tw;
      for (k = 0; k < items.length; k++) {
        s = symbolSize(items[k].kind);
        tw = Math.max(textWidth(items[k].label, pt), textWidth(items[k].sub, pt - 1));
        /* Symbol on the left of the column, its label filling the rest, so the next column cannot cover it. */
        w = Math.max(w, s.hw * 2 + 0.36 + tw);
      }
      return w;
    }

    spineW = colWidth(spine);
    totalW = 0;
    for (i = 0; i < branches.length; i++) {
      colW = Math.max(colWidth(branches[i].items), textWidth(branches[i].spec, pt - 1) + 0.8);
      cols.push(colW);
      totalW += colW;
    }
    if (!branches.length) totalW = spineW;
    totalW = Math.max(totalW, spineW);

    branchH = 0;
    for (i = 0; i < branches.length; i++) branchH = Math.max(branchH, branches[i].items.length * pitch);
    spineH = spine.length * pitch;
    height = spineH + 0.42 + branchH + 0.55;

    scale = 1;
    if (maxW > 0 && totalW > maxW) scale = Math.min(scale, maxW / totalW);
    if (maxH > 0 && height > maxH) scale = Math.min(scale, maxH / height);
    if (!(scale > 0)) scale = 1;

    var symbols = [], wires = [], labels = [];
    function addLabel(x, y, text, size, anchor) {
      if (!text) return;
      var tw = textWidth(text, size) * scale;
      var th = (size / 72) * 1.15 * scale;
      var left = anchor === 'middle' ? x - tw / 2 : (anchor === 'end' ? x - tw : x);
      labels.push({ x: left, y: y - th * 0.75, w: tw, h: th, text: text });
    }
    function addSymbol(kind, cx, cy, label, sub) {
      var s = symbolSize(kind);
      var sym = {
        kind: kind, x: cx, y: cy,
        hw: s.hw * scale, hh: s.hh * scale,
        label: label || '', sub: sub || ''
      };
      symbols.push(sym);
      addLabel(cx + sym.hw + 0.06 * scale, cy - 0.02 * scale, label, pt, 'start');
      addLabel(cx + sym.hw + 0.06 * scale, cy + (pt / 72) * scale, sub, pt - 1, 'start');
      return sym;
    }

    var busY = spineH * scale + 0.16 * scale;
    var cursor = 0;
    var branchX = [];
    for (i = 0; i < branches.length; i++) {
      var half = symbolSize(branches[i].items[0] ? branches[i].items[0].kind : 'breaker').hw;
      branchX.push((cursor + half + 0.1) * scale);
      cursor += cols[i];
    }
    var spineHalf = symbolSize(spine[0] ? spine[0].kind : 'utility').hw;
    var spineX = branches.length
      ? (branchX[0] + branchX[branchX.length - 1]) / 2
      : (spineHalf + 0.1) * scale;

    var prev = null;
    for (i = 0; i < spine.length; i++) {
      item = spine[i];
      var sy = (i + 0.5) * pitch * scale;
      var sym = addSymbol(item.kind, spineX, sy, item.label, item.sub);
      if (prev) wires.push({ x1: spineX, y1: prev.y + prev.hh, x2: spineX, y2: sym.y - sym.hh });
      prev = sym;
    }
    if (prev) wires.push({ x1: spineX, y1: prev.y + prev.hh, x2: spineX, y2: busY });

    var busLeft = branches.length ? branchX[0] : spineX - 0.5 * scale;
    var busRight = branches.length ? branchX[branchX.length - 1] : spineX + 0.5 * scale;
    if (busRight < busLeft) { var swap = busLeft; busLeft = busRight; busRight = swap; }
    wires.push({ x1: busLeft, y1: busY, x2: busRight, y2: busY, bus: true });
    /* Below the transformer body. A centered callout at the bus used to sit on the symbol. */
    addLabel((busLeft + busRight) / 2, busY - 0.06 * scale, (model.bus && model.bus.label) || '', pt, 'middle');
    if (model.interconnect && model.interconnect !== 'none' && model.interconnect !== 'unknown') {
      var method = model.interconnect === 'supply' ? '705.11 supply side' : (model.interconnect === '120' ? '705.12(B)(2) opposite ends' : '705.12(B)(1)');
      addLabel((busLeft + busRight) / 2, busY + 0.18 * scale, method, pt - 1, 'middle');
    }

    for (i = 0; i < branches.length; i++) {
      var bx = branchX[i];
      wires.push({ x1: bx, y1: busY, x2: bx, y2: busY + 0.2 * scale });
      var top = busY + 0.2 * scale;
      var previous = null;
      for (j = 0; j < branches[i].items.length; j++) {
        item = branches[i].items[j];
        var by = top + (j + 0.5) * pitch * scale;
        var bsym = addSymbol(item.kind, bx, by, item.label, item.sub);
        var fromY = previous ? previous.y + previous.hh : top;
        wires.push({ x1: bx, y1: fromY, x2: bx, y2: bsym.y - bsym.hh });
        previous = bsym;
      }
      if (branches[i].spec && previous) {
        addLabel(bx + 0.08 * scale, previous.y + previous.hh + 0.16 * scale, branches[i].spec, pt - 1, 'start');
      }
    }

    if (model.ground !== false) {
      var gx = busRight + 0.35 * scale;
      var gsym = addSymbol('ground', gx, busY + 0.34 * scale, '', 'G');
      wires.push({ x1: busRight, y1: busY, x2: gx, y2: busY });
      wires.push({ x1: gx, y1: busY, x2: gx, y2: gsym.y - gsym.hh });
      totalW = Math.max(totalW, (gx + 0.4) / scale);
    }

    /* A short bus centers a long callout left of the origin. Shift the sheet so it stays inside the frame. */
    var minX = 0, maxX = totalW * scale, k, lb, sym, wr;
    for (k = 0; k < labels.length; k++) {
      lb = labels[k];
      if (lb.x < minX) minX = lb.x;
      if (lb.x + lb.w > maxX) maxX = lb.x + lb.w;
    }
    for (k = 0; k < symbols.length; k++) {
      sym = symbols[k];
      if (sym.x - sym.hw < minX) minX = sym.x - sym.hw;
    }
    for (k = 0; k < wires.length; k++) {
      wr = wires[k];
      if (wr.x1 < minX) minX = wr.x1;
      if (wr.x2 < minX) minX = wr.x2;
    }
    if (minX < 0.08) {
      var dx = 0.08 - minX;
      for (k = 0; k < labels.length; k++) labels[k].x += dx;
      for (k = 0; k < symbols.length; k++) symbols[k].x += dx;
      for (k = 0; k < wires.length; k++) { wires[k].x1 += dx; wires[k].x2 += dx; }
      maxX += dx;
    }

    return {
      w: Math.max(totalW * scale, maxX),
      h: height * scale,
      scale: scale,
      symbols: symbols,
      wires: wires,
      labels: labels
    };
  }

  function boxesOverlap(a, b) {
    return a.x < b.x + b.w - 0.01 && b.x < a.x + a.w - 0.01 && a.y < b.y + b.h - 0.01 && b.y < a.y + a.h - 0.01;
  }

  function labelHits(lay) {
    var hits = [], i, j, s, box;
    for (i = 0; i < lay.labels.length; i++) {
      for (j = i + 1; j < lay.labels.length; j++) {
        if (boxesOverlap(lay.labels[i], lay.labels[j])) hits.push(['label', lay.labels[i].text, lay.labels[j].text]);
      }
      for (j = 0; j < lay.symbols.length; j++) {
        s = lay.symbols[j];
        box = { x: s.x - s.hw, y: s.y - s.hh, w: s.hw * 2, h: s.hh * 2 };
        if (boxesOverlap(lay.labels[i], box)) hits.push(['symbol', lay.labels[i].text, s.kind]);
      }
    }
    return hits;
  }

  function orthogonal(lay) {
    var i, w, bad = [];
    for (i = 0; i < lay.wires.length; i++) {
      w = lay.wires[i];
      if (Math.abs(w.x1 - w.x2) > 0.001 && Math.abs(w.y1 - w.y2) > 0.001) bad.push(w);
    }
    return bad;
  }

  function draw(lay, ox, oy, ops) {
    var i, w, s;
    for (i = 0; i < lay.wires.length; i++) {
      w = lay.wires[i];
      ops.push({ t: 'l', x1: ox + w.x1, y1: oy + w.y1, x2: ox + w.x2, y2: oy + w.y2, sw: w.bus ? 1.6 : 0.9, rgb: [0.12, 0.16, 0.22] });
    }
    for (i = 0; i < lay.symbols.length; i++) {
      s = lay.symbols[i];
      drawSymbol(ops, ox + s.x, oy + s.y, s.hw, s.hh, s.kind);
    }
    for (i = 0; i < lay.labels.length; i++) {
      var lb = lay.labels[i];
      ops.push({
        t: 'tx', x: ox + lb.x, y: oy + lb.y + lb.h * 0.8,
        size: Math.max(5, 8 * lay.scale), text: lb.text, anchor: 'start', rgb: [0.12, 0.2, 0.32]
      });
    }
  }

  function drawSymbol(ops, x, y, hw, hh, kind) {
    var ink = [0.12, 0.16, 0.22];
    function line(x1, y1, x2, y2, sw) {
      ops.push({ t: 'l', x1: x1, y1: y1, x2: x2, y2: y2, sw: sw || 0.8, rgb: ink });
    }
    function rect(x0, y0, w, h) {
      ops.push({ t: 'r', x: x0, y: y0, w: w, h: h, sw: 0.8, rgb: ink });
    }
    function circ(cx, cy, r) {
      ops.push({ t: 'c', x: cx, y: cy, r: r, sw: 0.8, rgb: ink });
    }
    if (kind === 'utility') {
      circ(x, y, hw);
      line(x - hw, y - hw - 0.08, x - 0.05, y - hw);
      line(x + hw, y - hw - 0.08, x + 0.05, y - hw);
    } else if (kind === 'meter') {
      circ(x, y, hw);
      ops.push({ t: 'tx', x: x, y: y + 0.03, size: 7, text: 'M', anchor: 'middle', rgb: ink });
    } else if (kind === 'breaker') {
      rect(x - hw, y - hh, hw * 2, hh * 2);
      line(x - hw, y + hh, x + hw, y - hh, 0.7);
    } else if (kind === 'disco') {
      line(x, y - hh, x, y - 0.02);
      line(x, y - 0.02, x + hw, y + hh);
      line(x - 0.06, y + hh, x + 0.06, y + hh);
    } else if (kind === 'transformer') {
      circ(x, y - hh * 0.35, hw * 0.85);
      circ(x, y + hh * 0.35, hw * 0.85);
    } else if (kind === 'ground') {
      line(x - hw, y - hh, x + hw, y - hh);
      line(x - hw * 0.62, y, x + hw * 0.62, y);
      line(x - hw * 0.28, y + hh, x + hw * 0.28, y + hh);
    } else if (kind === 'pv') {
      rect(x - hw, y - hh, hw * 2, hh * 2);
      line(x - hw, y + hh, x + hw, y - hh, 0.6);
    } else if (kind === 'bess') {
      rect(x - hw, y - hh, hw * 2, hh * 2);
      line(x - hw * 0.45, y - hh * 0.45, x - hw * 0.45, y + hh * 0.45);
      line(x - hw * 0.15, y - hh * 0.2, x - hw * 0.15, y + hh * 0.2);
      line(x + hw * 0.15, y - hh * 0.45, x + hw * 0.15, y + hh * 0.45);
      line(x + hw * 0.45, y - hh * 0.2, x + hw * 0.45, y + hh * 0.2);
    } else {
      rect(x - hw, y - hh, hw * 2, hh * 2);
      var mark = kind === 'inverter' ? 'INV' : (kind === 'pcs' ? 'PCS' : (kind === 'charger' ? 'EV' : (kind === 'load' ? 'L' : '')));
      if (mark) ops.push({ t: 'tx', x: x, y: y + 0.03, size: 6.5, text: mark, anchor: 'middle', rgb: ink });
    }
  }

  var api = {
    layout: layout,
    draw: draw,
    labelHits: labelHits,
    orthogonal: orthogonal,
    VERSION: 'editor-v2-sld/1'
  };
  root.OmegaEditorV2Sld = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : global);
