/* ═══════════════════════════════════════════════════════════════════════════
   omega-pipeline.js — the pipeline as a widget, for any tenant
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   WHY THIS IS CORE AND NOT A TENANT FILE.

   Every tenant surface that tracks work through stages has drawn its own
   version of the same strip, and each one has had to be found and fixed
   separately. This is one implementation: give it a stage list and a set of
   records and it draws a rail — a segment per stage, sized by how much is
   sitting there, with the count, the value, and whatever is stuck.

   It renders a VIEW. It does not own the data, does not fetch, does not
   write, and knows nothing about Firestore. A caller passes plain objects and
   a couple of accessors; the widget calls back when a segment is clicked.

   THE ONE OPINION IT HOLDS: a stage rail that hides its gates is a decoration.
   If a stage carries a gate — a condition a record must satisfy to advance —
   the widget shows the count of records SITTING at that stage that cannot yet
   pass it. That is the number the person reading the strip is actually
   looking for: not "how many are in pre-development" but "how many are stuck
   in pre-development", which is a different question and the only one that
   produces an action.

   ES5 on purpose. It runs in the same embedded and kiosk browsers as the rest
   of the runtime, loads with a plain <script src>, and has no dependencies.

   ── USE ────────────────────────────────────────────────────────────────────
     <script src="/omega-pipeline.js"></script>

     OmegaPipeline.render(document.getElementById('host'), {
       stages : F.STAGES,                  // [{key,label,short,rank,color,hint}]
       records: deals,                     // any array of objects
       stageOf: function (d) { return d.stage; },        // record -> stage key
       valueOf: function (d) { return d.capexUsd; },     // optional, for the $ line
       stuckOf: function (d) { return blockedReason(d); },// optional -> string|null
       money  : F.money,                   // optional formatter for valueOf
       onStage: function (key) { … },      // optional; segment click
       onRecord:function (rec) { … },      // optional; click a name in a peek
       title  : 'Pipeline',                // optional
       compact: false                      // optional; no value line, shorter rail
     });

   Re-render by calling render() again on the same host. It replaces its own
   markup and rebinds; there is no teardown to remember.
   ═══════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.OmegaPipeline = factory();
}(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  var CSS_ID = 'omega-pipeline-css';

  /* The widget ships its own styles once per document. They are scoped under
     .opl- so a host page's cascade cannot reach in and a tenant's own rules
     cannot be broken by it. Colours come from the page's custom properties
     where they exist and fall back to values that read on both themes. */
  var CSS = ''
    + '.opl{--opl-ink:var(--ink,#16202b);--opl-soft:var(--muted,#6b7280);'
    +   '--opl-line:var(--line,#e5e7eb);--opl-card:var(--card,#fff);'
    +   '--opl-warn:var(--warn,#b45309);font-size:13px;color:var(--opl-ink)}'
    + '.opl-h{display:flex;align-items:baseline;gap:10px;margin-bottom:10px}'
    + '.opl-h h3{margin:0;font-size:14px;font-weight:700;letter-spacing:.01em}'
    + '.opl-h .opl-tot{margin-left:auto;font-size:12px;color:var(--opl-soft)}'
    + '.opl-rail{display:flex;gap:3px;align-items:stretch;width:100%}'
    + '.opl-seg{flex:1 1 0;min-width:0;background:none;border:0;padding:0;'
    +   'font:inherit;color:inherit;text-align:left;cursor:pointer;display:block}'
    + '.opl-seg:disabled{cursor:default}'
    + '.opl-bar{height:8px;border-radius:3px;background:var(--opl-line);position:relative;overflow:hidden}'
    + '.opl-fill{position:absolute;inset:0;border-radius:3px;transform-origin:left center}'
    + '.opl-seg .opl-k{margin-top:6px;font-size:10.5px;letter-spacing:.06em;'
    +   'text-transform:uppercase;color:var(--opl-soft);white-space:nowrap;'
    +   'overflow:hidden;text-overflow:ellipsis;font-weight:600}'
    + '.opl-seg .opl-n{font-size:16px;font-weight:700;font-variant-numeric:tabular-nums;line-height:1.2}'
    + '.opl-seg .opl-v{font-size:11px;color:var(--opl-soft);font-variant-numeric:tabular-nums;'
    +   'white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'
    + '.opl-seg.on .opl-bar{box-shadow:0 0 0 2px var(--opl-ink)}'
    + '.opl-seg:focus-visible{outline:2px solid var(--opl-ink);outline-offset:3px;border-radius:4px}'
    + '.opl-stuck{display:inline-flex;align-items:center;gap:3px;margin-top:3px;'
    +   'font-size:10.5px;font-weight:700;color:var(--opl-warn)}'
    + '.opl-stuck b{font-variant-numeric:tabular-nums}'
    + '.opl-empty{color:var(--opl-soft);font-size:12px;padding:10px 0}'
    + '.opl-peek{margin-top:12px;border-top:1px solid var(--opl-line);padding-top:10px}'
    + '.opl-peek .opl-pk-h{display:flex;align-items:baseline;gap:8px;margin-bottom:6px}'
    + '.opl-peek .opl-pk-h strong{font-size:12.5px}'
    + '.opl-peek .opl-pk-h span{font-size:11.5px;color:var(--opl-soft)}'
    + '.opl-peek .opl-pk-h button{margin-left:auto;background:none;border:0;cursor:pointer;'
    +   'font:inherit;font-size:11.5px;color:var(--opl-soft);text-decoration:underline}'
    + '.opl-row{display:flex;gap:8px;align-items:baseline;padding:3px 0;cursor:pointer;'
    +   'border:0;background:none;font:inherit;width:100%;text-align:left;color:inherit}'
    + '.opl-row:hover{text-decoration:underline}'
    + '.opl-row .opl-rn{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
    + '.opl-row .opl-rs{font-size:11px;color:var(--opl-warn);flex:none}'
    + '@media (max-width:640px){.opl-rail{flex-wrap:wrap}.opl-seg{flex:1 1 40%}}';

  function css() {
    if (typeof document === 'undefined' || document.getElementById(CSS_ID)) return;
    var s = document.createElement('style');
    s.id = CSS_ID; s.textContent = CSS;
    (document.head || document.documentElement).appendChild(s);
  }

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }

  /* A compact money default so a caller that has no formatter still gets
     something readable rather than 1234567. */
  function shortMoney(v) {
    var n = num(v);
    if (!n) return '';
    var a = Math.abs(n);
    if (a >= 1e9) return '$' + (n / 1e9).toFixed(1).replace(/\.0$/, '') + 'B';
    if (a >= 1e6) return '$' + (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
    if (a >= 1e3) return '$' + Math.round(n / 1e3) + 'k';
    return '$' + Math.round(n);
  }

  function render(host, opt) {
    if (!host) return null;
    css();
    opt = opt || {};
    var stages  = opt.stages  || [];
    var records = opt.records || [];
    var stageOf = opt.stageOf || function (r) { return r && r.stage; };
    var valueOf = opt.valueOf || null;
    var stuckOf = opt.stuckOf || null;
    var money   = opt.money   || shortMoney;
    var compact = !!opt.compact;

    /* One pass over the records. Anything whose stage is not in the list is
       counted as off-rail rather than dropped — a record in a stage nobody
       defined is exactly the thing a pipeline view should surface, not hide. */
    var byKey = {}, offRail = 0, total = 0, grand = 0;
    var i, s;
    for (i = 0; i < stages.length; i++) byKey[stages[i].key] = { list: [], value: 0, stuck: [] };
    for (i = 0; i < records.length; i++) {
      var r = records[i], k = stageOf(r), b = byKey[k];
      if (!b) { offRail++; continue; }
      b.list.push(r); total++;
      if (valueOf) { var v = num(valueOf(r)); b.value += v; grand += v; }
      if (stuckOf) { var why = stuckOf(r); if (why) b.stuck.push({ rec: r, why: why }); }
    }

    var peak = 1;
    for (i = 0; i < stages.length; i++) peak = Math.max(peak, byKey[stages[i].key].list.length);

    var html = '<div class="opl">';
    html += '<div class="opl-h"><h3>' + esc(opt.title || 'Pipeline') + '</h3>';
    html += '<span class="opl-tot">' + total + (total === 1 ? ' live' : ' live')
          + (valueOf && grand ? ' · ' + esc(money(grand, true)) : '')
          + (offRail ? ' · ' + offRail + ' off-pipeline' : '') + '</span></div>';

    if (!records.length) {
      html += '<div class="opl-empty">Nothing in the pipeline yet.</div></div>';
      host.innerHTML = html;
      return { total: 0 };
    }

    html += '<div class="opl-rail">';
    for (i = 0; i < stages.length; i++) {
      s = stages[i];
      var bucket = byKey[s.key], n = bucket.list.length;
      var pct = Math.max(n ? 12 : 4, Math.round(n / peak * 100));
      var colour = s.color || 'var(--opl-ink)';
      var on = opt.selected === s.key;
      html += '<button class="opl-seg' + (on ? ' on' : '') + '" type="button"'
            + ' data-stage="' + esc(s.key) + '"'
            + ' title="' + esc((s.label || s.key) + (s.hint ? ' — ' + s.hint : '')) + '"'
            + ' aria-label="' + esc((s.label || s.key) + ': ' + n) + '">'
            + '<div class="opl-bar"><span class="opl-fill" style="background:' + esc(colour)
            +   ';width:' + pct + '%;opacity:' + (n ? 1 : .35) + '"></span></div>'
            + '<div class="opl-n">' + n + '</div>'
            + '<div class="opl-k">' + esc(s.short || s.label || s.key) + '</div>'
            + (compact || !valueOf ? ''
               : '<div class="opl-v">' + (bucket.value ? esc(money(bucket.value, true)) : '—') + '</div>')
            + (bucket.stuck.length
               ? '<span class="opl-stuck">▲ <b>' + bucket.stuck.length + '</b> stuck</span>' : '')
            + '</button>';
    }
    html += '</div>';

    /* The peek. Clicking a segment with a handler is the caller's business;
       without one, the widget opens the list itself, because a strip you
       cannot get behind is a picture of work rather than a way into it. */
    if (opt.selected && byKey[opt.selected]) {
      var sel = byKey[opt.selected], meta = null;
      for (i = 0; i < stages.length; i++) if (stages[i].key === opt.selected) meta = stages[i];
      html += '<div class="opl-peek"><div class="opl-pk-h">'
            + '<strong>' + esc((meta && meta.label) || opt.selected) + '</strong>'
            + '<span>' + sel.list.length + (sel.stuck.length ? ' · ' + sel.stuck.length + ' stuck' : '') + '</span>'
            + '<button type="button" data-close="1">close</button></div>';
      if (!sel.list.length) html += '<div class="opl-empty">Nothing at this stage.</div>';
      else {
        var stuckBy = {};
        for (i = 0; i < sel.stuck.length; i++) stuckBy[sel.stuck[i].rec.id] = sel.stuck[i].why;
        for (i = 0; i < Math.min(sel.list.length, 8); i++) {
          var rec = sel.list[i];
          var nm  = (opt.nameOf ? opt.nameOf(rec) : (rec.name || rec.title || rec.id || '—'));
          html += '<button class="opl-row" type="button" data-rec="' + esc(rec.id || i) + '">'
                + '<span class="opl-rn">' + esc(nm) + '</span>'
                + (stuckBy[rec.id] ? '<span class="opl-rs">' + esc(stuckBy[rec.id]) + '</span>' : '')
                + '</button>';
        }
        if (sel.list.length > 8)
          html += '<div class="opl-empty">and ' + (sel.list.length - 8) + ' more</div>';
      }
      html += '</div>';
    }

    html += '</div>';
    host.innerHTML = html;

    /* One delegated listener on the host, so a re-render never leaves a stack
       of handlers behind on elements that no longer exist. */
    if (!host.__oplBound) {
      host.__oplBound = true;
      host.addEventListener('click', function (e) {
        var o = host.__oplOpt || {};
        var seg = closest(e.target, '[data-stage]');
        if (seg) {
          var key = seg.getAttribute('data-stage');
          if (o.onStage) o.onStage(key);
          else render(host, assign({}, o, { selected: o.selected === key ? null : key }));
          return;
        }
        if (closest(e.target, '[data-close]')) {
          render(host, assign({}, host.__oplOpt, { selected: null }));
          return;
        }
        var row = closest(e.target, '[data-rec]');
        if (row && o.onRecord) {
          var id = row.getAttribute('data-rec');
          var list = o.records || [];
          for (var j = 0; j < list.length; j++) if (String(list[j].id) === id) { o.onRecord(list[j]); return; }
        }
      });
    }
    host.__oplOpt = opt;
    return { total: total, offRail: offRail, value: grand };
  }

  function closest(el, sel) {
    while (el && el.nodeType === 1) {
      if (el.matches ? el.matches(sel) : false) return el;
      el = el.parentNode;
    }
    return null;
  }
  function assign(t) {
    for (var i = 1; i < arguments.length; i++) {
      var s = arguments[i]; if (!s) continue;
      for (var k in s) if (Object.prototype.hasOwnProperty.call(s, k)) t[k] = s[k];
    }
    return t;
  }

  return { render: render, shortMoney: shortMoney, version: '1.0.0' };
}));
