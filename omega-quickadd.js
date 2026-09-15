/* ═══════════════════════════════════════════════════════════════════════════
   omega-quickadd.js — create a record in three fields, finish it later
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   THE PROBLEM THIS SOLVES, WRITTEN DOWN SO IT DOES NOT COME BACK.

   Every console in this platform grew the same creation dialog: one modal with
   every field the record could ever carry, dividers grouping them, help text
   under each. Each field was individually justified. Together they are a wall,
   and a wall is what a rep on a site with a phone in one hand does not fill
   in — so the deal is either never entered or entered with guesses, and a
   guess in a required field looks exactly like a decision afterwards.

   The fix is not fewer fields. It is ORDER. Three things are true of nearly
   every record here:

     1. A handful of fields are knowable at the moment of creation and are
        genuinely required — usually a name, a kind, and who is answerable.
     2. Everything else becomes knowable later, at a specific step.
     3. The backend already knows which step, because the stage gates say so.

   So this asks for (1), takes the record, and hands the caller a CHECKLIST for
   (2) built from the gates the caller already defines. The record exists after
   about fifteen seconds of typing; building it out is a sequence of small,
   obvious acts with a visible finish line, instead of one act of endurance.

   WHAT IT IS NOT. Not a form framework. It renders a short field list, reads
   it back, validates, resolves a promise. Tenants with a richer engine
   (tenants/osa/forms.js) keep using it for their long forms; this is for the
   first fifteen seconds, and for the checklist that follows.

   ES5, no dependencies, one <script src>, styles injected once.

   ── USE ────────────────────────────────────────────────────────────────────
     <script src="/omega-quickadd.js"></script>

     OmegaQuickAdd.open({
       title  : 'New project',
       lede   : 'Three things now. The rest is asked when it is knowable.',
       fields : [                                     // keep this SHORT
         {key:'name', label:'Site name', required:true, autofocus:true,
          placeholder:'Hillside Bottling Factory'},
         {key:'kind', label:'What are we building', type:'choice', required:true,
          options:[{value:'bess',label:'Storage',hint:'Battery'}, …]},
         {key:'org',  label:'Who brought it', type:'select', required:true,
          options:[{value:'acme',label:'Acme'}], note:'Locks when it advances.'}
       ],
       more   : [ … ],            // optional, collapsed behind "Add more now"
       submitLabel: 'Create',
       footNote   : 'Saves as a referral.'
     }).then(function (values) { if (values) create(values); });

     OmegaQuickAdd.checklist(host, {
       steps: [{key:'score', label:'Run the screening score', done:false,
                why:'The gate into spend', action:function(){…}}, …],
       onDone: function () { … }
     });
   ═══════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.OmegaQuickAdd = factory();
}(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  var CSS_ID = 'omega-quickadd-css';
  var CSS = ''
    + '.oqa-scrim{position:fixed;inset:0;background:rgba(15,20,26,.55);z-index:9000;'
    +   'display:flex;align-items:flex-start;justify-content:center;padding:24px 16px;overflow:auto}'
    + '.oqa{background:var(--card,#fff);color:var(--ink,#16202b);width:min(34rem,100%);'
    +   'border-radius:10px;box-shadow:0 18px 50px rgba(0,0,0,.28);overflow:hidden;'
    +   'font-family:inherit;font-size:14px;margin:auto}'
    + '.oqa-h{padding:20px 22px 0}'
    + '.oqa-h h2{margin:0;font-size:20px;font-weight:700;letter-spacing:-.01em}'
    + '.oqa-h p{margin:8px 0 0;font-size:13px;line-height:1.5;color:var(--muted,#6b7280)}'
    + '.oqa-b{padding:18px 22px 4px;display:flex;flex-direction:column;gap:16px}'
    /* display:flex beats [hidden]'s display:none, which is how the optional
       section shipped permanently open in the first cut. */
    + '.oqa-b[hidden]{display:none}'
    + '.oqa-f>label{display:block;font-size:12.5px;font-weight:600;margin-bottom:6px}'
    + '.oqa-f>label .oqa-req{color:var(--danger,#b3402f);margin-left:3px}'
    + '.oqa-f input[type=text],.oqa-f input[type=number],.oqa-f select,.oqa-f textarea{'
    +   'width:100%;box-sizing:border-box;padding:11px 12px;font:inherit;font-size:15px;'
    +   'border:1px solid var(--line,#d8dee4);border-radius:7px;background:var(--card,#fff);'
    +   'color:inherit}'
    + '.oqa-f input:focus,.oqa-f select:focus,.oqa-f textarea:focus{outline:2px solid var(--pri,#0070F2);'
    +   'outline-offset:0;border-color:transparent}'
    + '.oqa-note{margin-top:6px;font-size:11.5px;line-height:1.45;color:var(--muted,#6b7280)}'
    + '.oqa-err{margin-top:6px;font-size:12px;font-weight:600;color:var(--danger,#b3402f)}'
    + '.oqa-f.bad input,.oqa-f.bad select{border-color:var(--danger,#b3402f)}'
    /* the choice grid — big targets, because this is filled on a phone on a site */
    + '.oqa-choice{display:grid;grid-template-columns:repeat(auto-fit,minmax(8.5rem,1fr));gap:8px}'
    + '.oqa-choice button{padding:12px 10px;border:1.5px solid var(--line,#d8dee4);border-radius:8px;'
    +   'background:var(--card,#fff);color:inherit;font:inherit;cursor:pointer;text-align:left;'
    +   'display:flex;flex-direction:column;gap:2px;min-height:58px}'
    + '.oqa-choice button b{font-size:13.5px;font-weight:600}'
    + '.oqa-choice button span{font-size:11px;color:var(--muted,#6b7280);line-height:1.35}'
    + '.oqa-choice button.on{border-color:var(--pri,#0070F2);background:var(--pri-soft,#eef5ff);'
    +   'box-shadow:inset 0 0 0 1px var(--pri,#0070F2)}'
    + '.oqa-more{border-top:1px solid var(--line,#e5e7eb);margin-top:2px}'
    + '.oqa-more>button{width:100%;padding:13px 22px;background:none;border:0;font:inherit;'
    +   'font-size:13px;font-weight:600;color:var(--pri,#0070F2);cursor:pointer;text-align:left}'
    + '.oqa-more .oqa-b{padding-top:4px}'
    + '.oqa-f-row{display:grid;grid-template-columns:1fr 1fr;gap:12px}'
    + '@media (max-width:30rem){.oqa-f-row{grid-template-columns:1fr}}'
    + '.oqa-foot{display:flex;align-items:center;gap:12px;padding:16px 22px 20px;'
    +   'border-top:1px solid var(--line,#e5e7eb);margin-top:14px}'
    + '.oqa-foot .oqa-fn{font-size:11.5px;color:var(--muted,#6b7280);line-height:1.4;flex:1}'
    + '.oqa-btn{padding:10px 18px;border-radius:7px;font:inherit;font-size:13.5px;font-weight:600;'
    +   'cursor:pointer;border:1px solid var(--line,#d8dee4);background:var(--card,#fff);color:inherit}'
    + '.oqa-btn.pri{background:var(--pri,#0070F2);border-color:var(--pri,#0070F2);color:#fff}'
    + '.oqa-btn:disabled{opacity:.55;cursor:default}'
    /* the checklist */
    + '.oqc{font-size:13px;color:var(--ink,#16202b)}'
    + '.oqc-h{display:flex;align-items:baseline;gap:8px;margin-bottom:8px}'
    + '.oqc-h strong{font-size:13.5px}'
    + '.oqc-h span{font-size:11.5px;color:var(--muted,#6b7280)}'
    + '.oqc-bar{height:5px;border-radius:3px;background:var(--line,#e5e7eb);overflow:hidden;margin-bottom:10px}'
    + '.oqc-bar i{display:block;height:100%;background:var(--ok,#0D9488);border-radius:3px;transition:width .3s}'
    + '.oqc-step{display:grid;grid-template-columns:auto 1fr auto;gap:10px;align-items:baseline;'
    +   'padding:8px 0;border-bottom:1px solid var(--line,#f0f2f4)}'
    + '.oqc-step:last-child{border-bottom:0}'
    + '.oqc-step .oqc-m{width:18px;height:18px;border-radius:50%;border:1.5px solid var(--line,#d8dee4);'
    +   'display:grid;place-items:center;font-size:11px;flex:none;align-self:center}'
    + '.oqc-step.done .oqc-m{background:var(--ok,#0D9488);border-color:var(--ok,#0D9488);color:#fff}'
    + '.oqc-step.next .oqc-m{border-color:var(--pri,#0070F2);border-width:2px}'
    + '.oqc-step .oqc-l{font-weight:600}'
    + '.oqc-step.done .oqc-l{font-weight:500;color:var(--muted,#6b7280);text-decoration:line-through}'
    + '.oqc-step .oqc-w{display:block;font-weight:400;font-size:11.5px;color:var(--muted,#6b7280);margin-top:2px}'
    + '.oqc-step button{border:1px solid var(--pri,#0070F2);background:none;color:var(--pri,#0070F2);'
    +   'border-radius:6px;padding:5px 11px;font:inherit;font-size:12px;font-weight:600;cursor:pointer}'
    + '.oqc-step.done button{display:none}';

  function css() {
    if (typeof document === 'undefined' || document.getElementById(CSS_ID)) return;
    var s = document.createElement('style'); s.id = CSS_ID; s.textContent = CSS;
    (document.head || document.documentElement).appendChild(s);
  }
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function fieldHtml(f, i) {
    var id = 'oqa-' + i;
    var req = f.required ? '<span class="oqa-req" aria-hidden="true">*</span>' : '';
    var h = '<div class="oqa-f" data-key="' + esc(f.key) + '" data-i="' + i + '">';
    if (f.type !== 'choice') h += '<label for="' + id + '">' + esc(f.label) + req + '</label>';
    else h += '<label>' + esc(f.label) + req + '</label>';

    if (f.type === 'choice') {
      h += '<div class="oqa-choice" role="group">';
      (f.options || []).forEach(function (o) {
        h += '<button type="button" data-val="' + esc(o.value) + '"'
          +  (String(f.value || '') === String(o.value) ? ' class="on"' : '') + '>'
          +  '<b>' + esc(o.label) + '</b>'
          +  (o.hint ? '<span>' + esc(o.hint) + '</span>' : '') + '</button>';
      });
      h += '</div>';
    } else if (f.type === 'select') {
      h += '<select id="' + id + '">';
      if (!f.required || f.placeholder) h += '<option value="">' + esc(f.placeholder || '—') + '</option>';
      (f.options || []).forEach(function (o) {
        h += '<option value="' + esc(o.value) + '"'
          + (String(f.value || '') === String(o.value) ? ' selected' : '') + '>' + esc(o.label) + '</option>';
      });
      h += '</select>';
    } else if (f.type === 'textarea') {
      h += '<textarea id="' + id + '" rows="' + (f.rows || 3) + '" placeholder="'
        + esc(f.placeholder || '') + '">' + esc(f.value || '') + '</textarea>';
    } else {
      h += '<input id="' + id + '" type="' + (f.type === 'number' ? 'number' : 'text') + '"'
        + (f.step ? ' step="' + esc(f.step) + '"' : '')
        + (f.autofocus ? ' data-autofocus="1"' : '')
        + ' placeholder="' + esc(f.placeholder || '') + '" value="' + esc(f.value || '') + '">';
    }
    if (f.note) h += '<div class="oqa-note">' + f.note + '</div>';
    h += '<div class="oqa-err" hidden></div></div>';
    return h;
  }

  function open(opt) {
    css();
    opt = opt || {};
    var fields = (opt.fields || []).slice();
    var more   = (opt.more   || []).slice();
    var all    = fields.concat(more);

    return new Promise(function (resolve) {
      var scrim = document.createElement('div');
      scrim.className = 'oqa-scrim';
      var html = '<div class="oqa" role="dialog" aria-modal="true" aria-label="' + esc(opt.title || 'Create') + '">'
        + '<div class="oqa-h"><h2>' + esc(opt.title || 'Create') + '</h2>'
        + (opt.lede ? '<p>' + opt.lede + '</p>' : '') + '</div>'
        + '<div class="oqa-b">' + fields.map(function (f, i) { return fieldHtml(f, i); }).join('') + '</div>';
      if (more.length) {
        html += '<div class="oqa-more"><button type="button" data-more="1">'
             +  '+ ' + esc(opt.moreLabel || 'Add more now (optional)') + '</button>'
             +  '<div class="oqa-b" hidden data-morebody="1">'
             +  more.map(function (f, i) { return fieldHtml(f, fields.length + i); }).join('')
             +  '</div></div>';
      }
      html += '<div class="oqa-foot"><span class="oqa-fn">' + (opt.footNote || '') + '</span>'
           +  '<button type="button" class="oqa-btn" data-cancel="1">Cancel</button>'
           +  '<button type="button" class="oqa-btn pri" data-ok="1">'
           +  esc(opt.submitLabel || 'Create') + '</button></div></div>';
      scrim.innerHTML = html;
      document.body.appendChild(scrim);

      var box = scrim.firstChild;
      var af = box.querySelector('[data-autofocus]');
      if (af) setTimeout(function () { af.focus(); }, 30);

      function close(v) {
        document.removeEventListener('keydown', onKey, true);
        if (scrim.parentNode) scrim.parentNode.removeChild(scrim);
        resolve(v);
      }
      function onKey(e) {
        if (e.key === 'Escape') { e.preventDefault(); close(null); }
        else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(); }
      }
      document.addEventListener('keydown', onKey, true);
      scrim.addEventListener('click', function (e) { if (e.target === scrim) close(null); });

      box.addEventListener('click', function (e) {
        var t = e.target;
        var choice = t.closest && t.closest('.oqa-choice button');
        if (choice) {
          var wrap = choice.parentNode;
          var kids = wrap.querySelectorAll('button');
          for (var i = 0; i < kids.length; i++) kids[i].classList.remove('on');
          choice.classList.add('on');
          all[+wrap.parentNode.getAttribute('data-i')].value = choice.getAttribute('data-val');
          return;
        }
        if (t.closest && t.closest('[data-more]')) {
          var body = box.querySelector('[data-morebody]');
          var btn  = box.querySelector('[data-more]');
          body.hidden = !body.hidden;
          btn.textContent = body.hidden
            ? '+ ' + (opt.moreLabel || 'Add more now (optional)')
            : '− Hide the optional fields';
          return;
        }
        if (t.closest && t.closest('[data-cancel]')) { close(null); return; }
        if (t.closest && t.closest('[data-ok]')) submit();
      });

      function readValue(f, i) {
        if (f.type === 'choice') return f.value || '';
        var el = box.querySelector('#oqa-' + i);
        return el ? el.value.trim() : '';
      }
      function setErr(i, msg) {
        var wrap = box.querySelector('.oqa-f[data-i="' + i + '"]');
        if (!wrap) return;
        var e = wrap.querySelector('.oqa-err');
        wrap.classList.toggle('bad', !!msg);
        e.hidden = !msg; e.textContent = msg || '';
      }
      function submit() {
        var out = {}, bad = -1;
        for (var i = 0; i < all.length; i++) {
          var f = all[i], v = readValue(f, i);
          setErr(i, '');
          if (f.required && !v) {
            setErr(i, f.requiredMsg || 'Required.');
            if (bad < 0) bad = i;
            continue;
          }
          if (v && f.validate) {
            var msg = f.validate(v);
            if (msg) { setErr(i, msg); if (bad < 0) bad = i; continue; }
          }
          out[f.key] = f.type === 'number' ? (v === '' ? null : Number(v)) : v;
        }
        if (bad >= 0) {
          /* A failure inside the collapsed section is invisible, and an
             untouchable error is how a dialog becomes a dead end. */
          var wrap = box.querySelector('.oqa-f[data-i="' + bad + '"]');
          var body = box.querySelector('[data-morebody]');
          if (body && body.hidden && body.contains(wrap)) {
            body.hidden = false;
            box.querySelector('[data-more]').textContent = '− Hide the optional fields';
          }
          var f2 = wrap && wrap.querySelector('input,select,textarea,button');
          if (f2 && f2.focus) f2.focus();
          return;
        }
        close(out);
      }
    });
  }

  /* ── the checklist ────────────────────────────────────────────────────────
     The other half of the pattern. Creation is three fields because the rest
     is asked later; this is "later", made visible. Steps come from the
     caller's own gates, so the list cannot drift from what the backend will
     actually enforce. */
  function checklist(host, opt) {
    if (!host) return;
    css();
    opt = opt || {};
    var steps = opt.steps || [];
    var done = 0, nextIdx = -1, i;
    for (i = 0; i < steps.length; i++) {
      if (steps[i].done) done++;
      else if (nextIdx < 0) nextIdx = i;
    }
    var pct = steps.length ? Math.round(done / steps.length * 100) : 0;

    var h = '<div class="oqc"><div class="oqc-h"><strong>'
          + esc(opt.title || 'To build this out') + '</strong>'
          + '<span>' + done + ' of ' + steps.length + ' done</span></div>'
          + '<div class="oqc-bar"><i style="width:' + pct + '%"></i></div>';
    for (i = 0; i < steps.length; i++) {
      var s = steps[i];
      h += '<div class="oqc-step' + (s.done ? ' done' : (i === nextIdx ? ' next' : '')) + '">'
        +  '<span class="oqc-m">' + (s.done ? '✓' : '') + '</span>'
        +  '<span class="oqc-l">' + esc(s.label)
        +    (s.why ? '<span class="oqc-w">' + esc(s.why) + '</span>' : '') + '</span>'
        +  (s.action ? '<button type="button" data-step="' + i + '">'
             + esc(i === nextIdx ? (s.cta || 'Do this') : (s.cta || 'Open')) + '</button>' : '<span></span>')
        +  '</div>';
    }
    h += '</div>';
    host.innerHTML = h;

    if (!host.__oqcBound) {
      host.__oqcBound = true;
      host.addEventListener('click', function (e) {
        var b = e.target.closest && e.target.closest('[data-step]');
        if (!b) return;
        var o = host.__oqcOpt || {}, idx = +b.getAttribute('data-step');
        var st = (o.steps || [])[idx];
        if (st && st.action) st.action(st);
      });
    }
    host.__oqcOpt = opt;
    return { done: done, total: steps.length, next: nextIdx < 0 ? null : steps[nextIdx] };
  }

  return { open: open, checklist: checklist, version: '1.0.0' };
}));
