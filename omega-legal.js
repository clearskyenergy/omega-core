/* ═══════════════════════════════════════════════════════════════════════════════
   /omega-legal.js — ClearSky-OMEGA acceptance gate
   © 2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   ─────────────────────────────────────────────────────────────────────────────
   WHAT THIS DOES
   ─────────────────────────────────────────────────────────────────────────────
   After a user authenticates and a workspace resolves, but BEFORE the portal
   is shown, this module checks whether that user has signed the current
   version of the Terms of Service and the NDA. If not, it blocks the app with
   a signing gate and does not release it until an immutable acceptance record
   is written to Firestore.

   The gate is built to hold up as an enforceable clickwrap:
     • both documents must be scrolled to the end before their box can be ticked
     • the boxes start UNCHECKED (no pre-ticked consent)
     • the signer types their legal name, entity, and title
     • the record stores the FULL TEXT that was on screen, not just a version tag
     • the record is create-only — no update, no delete (see firestore-rules-legal.txt)

   ─────────────────────────────────────────────────────────────────────────────
   WIRING (index.html)
   ─────────────────────────────────────────────────────────────────────────────
     <script src="/omega-legal-docs.js"></script>
     <script src="/omega-legal.js"></script>

   then inside onAuthStateChanged, after the workspace resolves:

     OmegaLegal.require({
       db: db, firebase: firebase, user: user, ws: ws,
       onDecline: function(){ auth.signOut(); }
     }, function(){  ...show the app...  });

   ES5 only. No build step. No dependencies beyond firebase-compat.
   ═══════════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var COLLECTION = 'legal_acceptances';
  var MOUNTED = false;

  function docs()  { return global.OMEGA_LEGAL_DOCS || null; }
  function version(){ var d = docs(); return d ? d.version : ''; }
  function company(){ var d = docs(); return (d && d.company) || {}; }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* FNV-1a 32-bit. Not cryptographic — an integrity marker so you can prove a
     stored record matches the wording that was on screen. */
  function hash(str) {
    var h = 0x811c9dc5, i;
    for (i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return ('0000000' + h.toString(16)).slice(-8) + '-' + str.length;
  }

  /* Flatten one document to plain text — this is what gets stored and what the
     hash is computed over. */
  function plainText(doc) {
    var out = [doc.title, doc.sub || '', ''], i, j;
    for (i = 0; i < doc.sections.length; i++) {
      out.push(doc.sections[i].h);
      for (j = 0; j < doc.sections[i].p.length; j++) out.push(doc.sections[i].p[j]);
      out.push('');
    }
    return out.join('\n');
  }

  /* ── Styles ───────────────────────────────────────────────────────────────── */
  function injectCss() {
    if (document.getElementById('omega-legal-css')) return;
    var s = document.createElement('style');
    s.id = 'omega-legal-css';
    s.textContent = [
      '#olg-scrim{position:fixed;inset:0;z-index:2147483000;background:rgba(5,42,61,.72);',
      '  backdrop-filter:blur(6px);display:none;align-items:center;justify-content:center;padding:24px}',
      '#olg-scrim.on{display:flex}',
      '#olg-card{background:#FAFAF8;border-radius:16px;width:900px;max-width:100%;max-height:92vh;',
      '  display:flex;flex-direction:column;box-shadow:0 30px 80px rgba(0,0,0,.4);overflow:hidden;',
      '  font-family:inherit;color:#0F2733}',
      '.olg-head{padding:22px 28px 16px;border-bottom:1px solid #DDD8D0;background:#fff}',
      '.olg-eyebrow{font-size:12px;font-weight:700;color:#00A9A4;letter-spacing:.03em}',
      '.olg-head h2{font-size:21px;font-weight:800;color:#08384F;margin:4px 0 6px;line-height:1.25}',
      '.olg-head p{font-size:13.5px;color:#5A7180;line-height:1.55;max-width:68ch;margin:0}',
      '.olg-tabs{display:flex;gap:6px;padding:12px 28px 0;background:#fff;border-bottom:1px solid #DDD8D0}',
      '.olg-tab{appearance:none;border:1px solid #DDD8D0;border-bottom:none;background:#F4F1EC;',
      '  padding:9px 16px;border-radius:9px 9px 0 0;font:inherit;font-size:13px;font-weight:600;',
      '  color:#5A7180;cursor:pointer;position:relative;top:1px}',
      '.olg-tab.on{background:#FAFAF8;color:#08384F;border-color:#DDD8D0}',
      '.olg-tab .olg-tick{color:#1DB954;font-weight:800;margin-left:7px;visibility:hidden}',
      '.olg-tab.done .olg-tick{visibility:visible}',
      '.olg-pane{display:none;flex:1;min-height:0;overflow-y:auto;padding:22px 28px;',
      '  background:#FAFAF8;-webkit-overflow-scrolling:touch}',
      '.olg-pane.on{display:block}',
      '.olg-pane h3{font-size:15px;font-weight:800;color:#08384F;margin:22px 0 8px}',
      '.olg-pane h3:first-child{margin-top:0}',
      '.olg-pane p{font-size:13.5px;line-height:1.68;color:#26404F;margin:0 0 9px;max-width:78ch}',
      '.olg-end{margin:26px 0 4px;padding:12px 14px;border-radius:10px;background:#EEF6F6;',
      '  border:1px solid #C9E5E4;font-size:12.5px;color:#0F2733}',
      '.olg-foot{border-top:1px solid #DDD8D0;background:#fff;padding:16px 28px 20px;flex:0 0 auto}',
      '.olg-consent{display:flex;gap:11px;align-items:flex-start;padding:11px 13px;border-radius:10px;',
      '  border:1px solid #DDD8D0;background:#F4F1EC;margin-bottom:12px}',
      '.olg-consent.locked{opacity:.5}',
      '.olg-consent input{margin-top:2px;width:17px;height:17px;flex:0 0 auto;accent-color:#00A9A4;cursor:pointer}',
      '.olg-consent label{font-size:13px;line-height:1.5;cursor:pointer}',
      '.olg-consent .olg-lockmsg{display:block;font-size:11.5px;color:#8A6D3B;margin-top:3px}',
      '.olg-sign{display:grid;grid-template-columns:1fr 1fr 1fr;gap:11px;margin-bottom:13px}',
      '.olg-f label{display:block;font-size:11.5px;font-weight:700;color:#5A7180;margin-bottom:4px}',
      '.olg-f input{width:100%;padding:9px 11px;border:1px solid #CFD7E0;border-radius:8px;',
      '  font:inherit;font-size:14px;background:#fff;color:#0F2733}',
      '.olg-f input:focus{outline:2px solid #00A9A4;outline-offset:1px;border-color:#00A9A4}',
      '.olg-attest{font-size:11.5px;color:#5A7180;line-height:1.55;margin:0 0 13px;max-width:80ch}',
      '.olg-actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap}',
      '.olg-btn{appearance:none;border:none;border-radius:10px;padding:12px 22px;font:inherit;',
      '  font-size:14px;font-weight:700;cursor:pointer}',
      '.olg-primary{background:#00A9A4;color:#fff;flex:1;min-width:220px}',
      '.olg-primary:disabled{background:#C6CDD3;color:#fff;cursor:not-allowed}',
      '.olg-ghost{background:transparent;color:#5A7180;border:1px solid #CFD7E0}',
      '.olg-link{background:none;border:none;color:#0070F2;font:inherit;font-size:12.5px;',
      '  text-decoration:underline;cursor:pointer;padding:0}',
      '.olg-err{display:none;margin-top:11px;padding:10px 13px;border-radius:9px;background:#FDECEA;',
      '  border:1px solid #F5C6C1;color:#B3261E;font-size:13px;line-height:1.5}',
      '@media(max-width:720px){',
      '  #olg-scrim{padding:0;align-items:stretch}',
      '  #olg-card{max-height:100vh;border-radius:0;width:100%}',
      '  .olg-head,.olg-pane,.olg-foot{padding-left:18px;padding-right:18px}',
      '  .olg-tabs{padding-left:18px;padding-right:18px}',
      '  .olg-sign{grid-template-columns:1fr}',
      '  .olg-primary{min-width:0}',
      '}'
    ].join('');
    document.head.appendChild(s);
  }

  /* ── Markup ───────────────────────────────────────────────────────────────── */
  function build(ctx) {
    injectCss();
    var D = docs().docs, i, j, k;

    var tabs = '', panes = '', consents = '';
    for (i = 0; i < D.length; i++) {
      var d = D[i];
      tabs += '<button type="button" class="olg-tab' + (i === 0 ? ' on' : '') + '" data-tab="' + esc(d.id) + '">'
            + esc(d.title) + '<span class="olg-tick">&#10003;</span></button>';

      var body = '';
      for (j = 0; j < d.sections.length; j++) {
        body += '<h3>' + esc(d.sections[j].h) + '</h3>';
        for (k = 0; k < d.sections[j].p.length; k++) {
          body += '<p>' + esc(d.sections[j].p[k]) + '</p>';
        }
      }
      body += '<div class="olg-end">You have reached the end of the ' + esc(d.title)
            + '. The box below is now active.</div>';
      panes += '<div class="olg-pane' + (i === 0 ? ' on' : '') + '" data-pane="' + esc(d.id) + '">' + body + '</div>';

      consents += '<div class="olg-consent locked" data-consent="' + esc(d.id) + '">'
               +   '<input type="checkbox" id="olg-cb-' + esc(d.id) + '" disabled>'
               +   '<label for="olg-cb-' + esc(d.id) + '">' + esc(d.consent)
               +     '<span class="olg-lockmsg">Read to the end of the document above to enable this.</span>'
               +   '</label>'
               + '</div>';
    }

    var co = company();
    var wrap = document.createElement('div');
    wrap.id = 'olg-scrim';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.setAttribute('aria-labelledby', 'olg-title');
    wrap.innerHTML =
      '<div id="olg-card">'
    +   '<div class="olg-head">'
    +     '<div class="olg-eyebrow">' + esc(co.platform || 'ClearSky-OMEGA') + '</div>'
    +     '<h2 id="olg-title">Sign these agreements to open your workspace</h2>'
    +     '<p>' + esc(co.legalName || 'ClearSky Energy Solutions LLC') + ' licenses access to this platform, '
    +       'not the software behind it. Both agreements below must be signed before your account is activated. '
    +       'You can download a copy at any time.</p>'
    +   '</div>'
    +   '<div class="olg-tabs">' + tabs + '</div>'
    +   panes
    +   '<div class="olg-foot">'
    +     consents
    +     '<div class="olg-sign">'
    +       '<div class="olg-f"><label for="olg-name">Your full legal name</label>'
    +         '<input id="olg-name" type="text" autocomplete="name" placeholder="Jane A. Smith"></div>'
    +       '<div class="olg-f"><label for="olg-entity">Company or entity you bind</label>'
    +         '<input id="olg-entity" type="text" autocomplete="organization" placeholder="Acme Energy LLC"></div>'
    +       '<div class="olg-f"><label for="olg-title-in">Your title</label>'
    +         '<input id="olg-title-in" type="text" autocomplete="organization-title" placeholder="Director of Development"></div>'
    +     '</div>'
    +     '<p class="olg-attest">Typing your name and signing below is your electronic signature under E-SIGN and Iowa\u2019s '
    +       'Uniform Electronic Transactions Act. We record the exact text you signed, your name, entity, title, '
    +       'email, account ID, and the date and time. Signing as <strong>' + esc(ctx.email) + '</strong>.</p>'
    +     '<div class="olg-actions">'
    +       '<button type="button" class="olg-btn olg-primary" id="olg-go" disabled>Sign and open my workspace</button>'
    +       '<button type="button" class="olg-btn olg-ghost" id="olg-no">Decline and sign out</button>'
    +       '<button type="button" class="olg-link" id="olg-dl">Download a copy</button>'
    +     '</div>'
    +     '<div class="olg-err" id="olg-err"></div>'
    +   '</div>'
    + '</div>';
    document.body.appendChild(wrap);
    return wrap;
  }

  /* ── Downloadable copy ────────────────────────────────────────────────────── */
  function copyHtml(ctx, signed) {
    var D = docs().docs, co = company(), i, j, k, out = '';
    out += '<!doctype html><meta charset="utf-8"><title>' + esc(co.platform) + ' agreements</title>';
    out += '<style>body{font:14px/1.65 Georgia,serif;max-width:44em;margin:40px auto;padding:0 20px;color:#1a1a1a}'
         + 'h1{font-size:20px} h2{font-size:17px;margin-top:34px} h3{font-size:14px;margin:20px 0 6px}'
         + '.meta{background:#f3f3ef;border:1px solid #ddd;padding:14px 16px;font:12px/1.7 monospace;white-space:pre-wrap}'
         + '</style>';
    out += '<h1>' + esc(co.legalName) + ' &mdash; ' + esc(co.platform) + '</h1>';
    out += '<div class="meta">Document version: ' + esc(version()) + '\n'
         + 'Account: ' + esc(ctx.email) + '\n'
         + 'Account ID: ' + esc(ctx.uid) + '\n'
         + (signed
             ? ('Signed by: ' + esc(signed.signerName) + ', ' + esc(signed.signerTitle) + '\n'
              + 'On behalf of: ' + esc(signed.entityName) + '\n'
              + 'Signed at: ' + esc(signed.clientTime) + '\n'
              + 'Record ID: ' + esc(signed.recordId))
             : 'Status: UNSIGNED COPY (for review)')
         + '</div>';
    for (i = 0; i < D.length; i++) {
      out += '<h2>' + esc(D[i].title) + '</h2>';
      for (j = 0; j < D[i].sections.length; j++) {
        out += '<h3>' + esc(D[i].sections[j].h) + '</h3>';
        for (k = 0; k < D[i].sections[j].p.length; k++) {
          out += '<p>' + esc(D[i].sections[j].p[k]) + '</p>';
        }
      }
    }
    return out;
  }

  function download(ctx, signed) {
    try {
      var blob = new Blob([copyHtml(ctx, signed)], { type: 'text/html' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'clearsky-omega-agreements-' + version() + (signed ? '-signed' : '') + '.html';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    } catch (e) {
      var w = global.open('', '_blank');
      if (w) { w.document.write(copyHtml(ctx, signed)); w.document.close(); }
    }
  }

  /* ── The gate ─────────────────────────────────────────────────────────────── */
  function openGate(ctx, onPass, onDecline) {
    if (MOUNTED) return;
    MOUNTED = true;

    var scrim = build(ctx);
    var D = docs().docs;
    var read = {}, i;
    var go   = document.getElementById('olg-go');
    var err  = document.getElementById('olg-err');

    function fail(msg) { err.innerHTML = msg; err.style.display = 'block'; }
    function clearFail(){ err.style.display = 'none'; }

    /* Enable a document's checkbox once its pane has been scrolled to the end.

       The subtle failure to avoid: before the browser lays the pane out,
       clientHeight and scrollHeight are both 0, and a naive "scrollTop +
       clientHeight >= scrollHeight" test reads TRUE — which would silently
       unlock a 14,000-word agreement nobody scrolled. So a pane with no
       measured height is never treated as read, and we re-check on layout
       events rather than on a fixed timer. */
    var marks = [];
    function watchPane(pane) {
      var id = pane.getAttribute('data-pane');

      function laidOut() { return pane.clientHeight > 0 && pane.scrollHeight > 0; }
      function atEnd()   { return pane.scrollTop + pane.clientHeight >= pane.scrollHeight - 24; }

      function mark() {
        if (read[id]) return;
        if (!laidOut() || !atEnd()) return;   // unmeasured = not read
        read[id] = true;
        var box = document.getElementById('olg-cb-' + id);
        if (!box) { read[id] = false; return; }
        box.disabled = false;
        var row = scrim.querySelector('[data-consent="' + id + '"]');
        if (row) {
          row.className = 'olg-consent';
          var lock = row.querySelector('.olg-lockmsg');
          if (lock) lock.style.display = 'none';
        }
        var tab = scrim.querySelector('.olg-tab[data-tab="' + id + '"]');
        if (tab && tab.className.indexOf('done') < 0) tab.className = tab.className + ' done';
        refresh();
      }

      pane.onscroll = mark;
      marks.push(mark);
    }
    var panes = scrim.querySelectorAll('.olg-pane');
    for (i = 0; i < panes.length; i++) watchPane(panes[i]);

    /* Re-evaluate every pane whenever layout could have changed: after the
       first paint, on resize, on orientation change, and on tab switch. This
       is what unlocks a document short enough not to scroll — once it has
       actually been measured. */
    function recheck() { for (var m = 0; m < marks.length; m++) marks[m](); }
    if (global.requestAnimationFrame) {
      global.requestAnimationFrame(function () { global.requestAnimationFrame(recheck); });
    }
    if (global.addEventListener) {
      global.addEventListener('resize', recheck, false);
      global.addEventListener('orientationchange', recheck, false);
    }
    global.setTimeout(recheck, 400);   // belt and braces for slow first paint

    /* Tabs */
    var tabEls = scrim.querySelectorAll('.olg-tab');
    for (i = 0; i < tabEls.length; i++) {
      tabEls[i].onclick = (function (btn) {
        return function () {
          var id = btn.getAttribute('data-tab'), n;
          var ts = scrim.querySelectorAll('.olg-tab');
          for (n = 0; n < ts.length; n++) ts[n].className = ts[n].className.replace(/\bon\b/, '').replace(/\s+/g, ' ');
          btn.className = btn.className + ' on';
          var ps = scrim.querySelectorAll('.olg-pane');
          for (n = 0; n < ps.length; n++) {
            var pid = ps[n].getAttribute('data-pane');
            ps[n].className = 'olg-pane' + (pid === id ? ' on' : '');
          }
          recheck();   // a newly revealed pane can now be measured
        };
      })(tabEls[i]);
    }

    /* Enable the sign button only when everything is satisfied. */
    function fields() {
      return {
        name:   document.getElementById('olg-name').value.replace(/^\s+|\s+$/g, ''),
        entity: document.getElementById('olg-entity').value.replace(/^\s+|\s+$/g, ''),
        title:  document.getElementById('olg-title-in').value.replace(/^\s+|\s+$/g, '')
      };
    }
    function ready() {
      var f = fields(), n;
      if (f.name.length < 3 || f.name.indexOf(' ') < 0) return false;
      if (f.entity.length < 2 || f.title.length < 2) return false;
      for (n = 0; n < D.length; n++) {
        var b = document.getElementById('olg-cb-' + D[n].id);
        if (!b || !b.checked) return false;
      }
      return true;
    }
    function refresh() { go.disabled = !ready(); }

    var watch = ['olg-name', 'olg-entity', 'olg-title-in'];
    for (i = 0; i < watch.length; i++) {
      document.getElementById(watch[i]).oninput = refresh;
    }
    for (i = 0; i < D.length; i++) {
      document.getElementById('olg-cb-' + D[i].id).onchange = refresh;
    }

    document.getElementById('olg-dl').onclick = function () { download(ctx, null); };
    document.getElementById('olg-no').onclick = function () {
      teardown();
      if (onDecline) onDecline();
    };

    function teardown() {
      MOUNTED = false;
      if (global.removeEventListener) {
        global.removeEventListener('resize', recheck, false);
        global.removeEventListener('orientationchange', recheck, false);
      }
      if (scrim && scrim.parentNode) scrim.parentNode.removeChild(scrim);
      document.documentElement.style.overflow = '';
    }

    /* Sign */
    go.onclick = function () {
      if (!ready()) return;
      clearFail();
      go.disabled = true;
      go.textContent = 'Recording your signature\u2026';

      var f = fields();
      var stamp = new Date();
      var bundle = [], texts = [], n;
      for (n = 0; n < D.length; n++) {
        var txt = plainText(D[n]);
        texts.push(txt);
        bundle.push({ id: D[n].id, title: D[n].title, hash: hash(txt), text: txt });
      }

      var recordId = ctx.uid + '__' + version();
      var payload = {
        uid:         ctx.uid,
        email:       ctx.email,
        orgId:       ctx.orgId || '',
        tenant:      ctx.tenantName || '',
        docVersion:  version(),
        signerName:  f.name,
        entityName:  f.entity,
        signerTitle: f.title,
        documents:   bundle,
        bundleHash:  hash(texts.join('\n\u0000\n')),
        acceptedAt:  ctx.firebase.firestore.FieldValue.serverTimestamp(),
        clientTime:  stamp.toISOString(),
        tzOffsetMin: stamp.getTimezoneOffset(),
        userAgent:   (global.navigator && navigator.userAgent) || '',
        language:    (global.navigator && navigator.language) || '',
        screen:      (global.screen ? (screen.width + 'x' + screen.height) : ''),
        href:        global.location ? location.href : '',
        method:      'clickwrap-v1'
      };

      ctx.db.collection(COLLECTION).doc(recordId).set(payload)
        .then(function () {
          download(ctx, {
            signerName: f.name, entityName: f.entity, signerTitle: f.title,
            clientTime: stamp.toISOString(), recordId: recordId
          });
          teardown();
          onPass();
        })['catch'](function (e) {
          go.disabled = false;
          go.textContent = 'Sign and open my workspace';
          fail('We could not record your signature, so we cannot open the workspace yet. '
             + 'Please try again, or email <strong>' + esc(company().notice || '')
             + '</strong> if it keeps failing. <br><span style="font-size:11.5px;opacity:.8">('
             + esc((e && e.code) || (e && e.message) || 'unknown error') + ')</span>');
        });
    };

    document.documentElement.style.overflow = 'hidden';
    scrim.className = 'on';
    setTimeout(function () { var p = scrim.querySelector('.olg-pane.on'); if (p) p.focus && p.focus(); }, 30);
  }

  /* ── Public entry point ───────────────────────────────────────────────────── */
  /* opts: { db, firebase, user, ws, onDecline }
     Calls onPass() only once the current version is on file. */
  function require_(opts, onPass) {
    var user = opts.user, db = opts.db, ws = opts.ws || {};
    var decline = opts.onDecline || function () {};

    if (!docs() || !docs().docs || !docs().docs.length) {
      /* Fail CLOSED. If the agreements did not load, nobody gets in — that is
         the entire point of this gate. */
      if (global.console) console.error('[OmegaLegal] omega-legal-docs.js did not load. Access blocked.');
      alert('The workspace agreements could not be loaded, so access is on hold. '
          + 'Please reload the page, or contact ' + (company().notice || 'support') + '.');
      decline();
      return;
    }

    var ctx = {
      db: db, firebase: opts.firebase,
      uid: user.uid, email: user.email || '',
      orgId: ws.orgId || '', tenantName: ws.clientName || ''
    };
    var recordId = ctx.uid + '__' + version();

    db.collection(COLLECTION).doc(recordId).get()
      .then(function (snap) {
        if (snap && snap.exists) { onPass(); return; }
        openGate(ctx, onPass, decline);
      })['catch'](function (e) {
        /* A read failure is usually missing security rules. Fail closed and
           show the gate — a duplicate signature is harmless (same doc id,
           create-only), an ungated session is not. */
        if (global.console) console.warn('[OmegaLegal] acceptance lookup failed:', e);
        openGate(ctx, onPass, decline);
      });
  }

  global.OmegaLegal = {
    require:   require_,
    version:   version,
    plainText: plainText,
    hash:      hash,
    COLLECTION: COLLECTION
  };
})(window);
