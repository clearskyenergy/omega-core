/* ══════════════════════════════════════════════════════════════════════
   omega-design-ai.js  ·  ClearSky-OMEGA  ·  "Design with AI"
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   ONE BUTTON, TWO HONEST ANSWERS
   The editor already knew how to do this. The autopilot in editor.html
   sequences geocode → parcel → roads → size → guided build →
   interconnection → Grid Atlas → save, with a HUD and a Stop that means
   it. What it never had was a way in: it runs only when the page is
   opened with ?address= and ?auto=, which mission.html does and a person
   sitting in the editor cannot.

   So this is the way in, and it is deliberately not a second autopilot.
   It collects an address and a size, then hands them to the contract that
   already exists — a fresh tab for a new site, or the postMessage command
   channel when a run has already finished on this one.

   WHY THE TWO ANSWERS ARE LABELLED DIFFERENTLY
   The autopilot's own layout() walks the guided build placing each node
   thirty feet along a vector from the site centre. It does not know where
   the building is, what the setbacks are, or that there is a drainage
   easement in the way. It is a sketch, it has always been a sketch, and
   on a screen next to a satellite image it is very easy to mistake for a
   drawing. So this labels it: SKETCH, unverified placement.

   "Make it buildable" is the other answer. It asks for what a sketch does
   not have — the surveyed parcel, the confirmed service wall, the real
   equipment footprints, the clearance basis, the reviewed obstacles — and
   sends them to /api/site-plan, where the constrained planner does the
   placement sweep and the A* route behind a token and an entitlement.
   When the evidence is short it says which piece, by name, and draws
   nothing. That refusal is the feature. A layout that quietly invents a
   service location is worse than no layout, because someone will send it.

   WHAT THIS FILE MUST NOT BECOME
   No geometry lives here. The placement rules, clearances and routing are
   in /api/site-plan for the reason CLAUDE.md gives: shipped to the browser
   they are readable by every tenant. This file collects inputs, calls the
   function, and renders what comes back.
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  var TAG = '[design-ai]';
  var doc = root.document;

  function el(tag, css, text) {
    var e = doc.createElement(tag);
    if (css) e.style.cssText = css;
    if (text != null) e.textContent = text;
    return e;
  }
  function num(v) { var n = parseFloat(v); return (isFinite(n) && n > 0) ? n : null; }

  /* Same test the autopilot uses before it will geocode. A bare city name
     must not become a site. Kept in step with looksLikeAddress() there. */
  function looksLikeAddress(v) {
    return /\d/.test(v) || /\b(st|street|rd|road|ave|avenue|blvd|dr|drive|ln|lane|way|hwy|route|pkwy|ct|court|pl|place)\b/i.test(v);
  }

  function signedIn() {
    try { return !!(root.firebase && firebase.auth().currentUser); } catch (e) { return false; }
  }

  /* Has a run already finished on THIS tab with a map to build on? That is
     the exact condition the autopilot's own command channel checks before
     it will accept OMEGA_AUTOPILOT_CMD, so ask it the same way rather than
     guessing and having the message silently ignored. */
  function canCommandThisTab() {
    try {
      var ST = root.__omegaAutopilot;
      return !!(ST && ST.finished && !ST.stopped && !ST.fatal && ST.centre);
    } catch (e) { return false; }
  }

  function hasDrawing() {
    try {
      return !!(root.S && ((S.elements || []).length || (S.shapes || []).length ||
                           (S.conduits || []).length || (S._trenches || []).length));
    } catch (e) { return false; }
  }

  /* ── SITE TYPE ────────────────────────────────────────────────────────
     Not every site is a battery (Thomas, 2026-09-14). The editor already
     carries the project type — it drives the sheet set, the cover labels
     and the assembly — and this dialog ignored it and hardcoded a BESS, so
     pressing "Design with AI" on a solar job sketched a battery.

     The dropdown is populated from the editor's own registry rather than a
     second list here, defaults to the type already selected, and SETS it on
     change so the rest of the editor follows the same choice.

     WHAT THE AUTOPILOT CAN ACTUALLY BUILD is a smaller set than what the
     editor can draw. Its layout() walks the behind/front-of-meter sequence
     (battery, transformer, disconnect, switchgear, meter, POI). There is no
     autopilot path for solar arrays, chargers or a data centre lineup yet.
     Rather than sketch a battery on a solar site, the other types run the
     SITE half — geocode, parcel, roads, frontage — and stop there, saying
     so. A half-build that is honest about the half is useful; one that
     quietly draws the wrong technology is not. */
  /* What the autopilot draws for each type, mirroring TYPE_PLAN in the
     editor. 'build' runs a guided build, 'array' packs a PV field, 'site'
     loads the ground and names the human step. Kept as words rather than a
     boolean because the dialog has to say which of the three it is about to
     do before anybody presses the button. */
  var TYPE_DOES = {
    bess:       'build', solarbess: 'build',
    solar:      'array',
    ev:         'site',  evl2: 'site', der: 'site', datacenter: 'site'
  };
  function does(k) { return TYPE_DOES[k] || 'site'; }
  var AUTO_BUILDS = { bess: 1, solarbess: 1, solar: 1 };

  function types() {
    try {
      if (root.OmegaProjectTypes && typeof OmegaProjectTypes.list === 'function') {
        var l = OmegaProjectTypes.list();
        if (l && l.length) return l;
      }
    } catch (e) {}
    return [{ key: 'bess', label: 'BESS — Battery Energy Storage', noun: 'BESS' }];
  }
  function currentType() {
    try {
      if (root.OmegaProjectTypes && typeof OmegaProjectTypes.get === 'function')
        return OmegaProjectTypes.get() || 'bess';
    } catch (e) {}
    return 'bess';
  }
  function setType(k) {
    try {
      if (root.OmegaProjectTypes && typeof OmegaProjectTypes.set === 'function') OmegaProjectTypes.set(k);
    } catch (e) {}
  }

  /* ── the sketch: hand the address to the autopilot's own contract ────── */

  function launch(o) {
    /* auto=bess runs the whole chain; auto=map stops after the site. */
    var auto = AUTO_BUILDS[o.type] ? 'bess' : 'map';
    if (canCommandThisTab()) {
      /* The map, parcel and roads are already here. Build on them instead
         of throwing the tab away — this is the autopilot's second turn. */
      root.postMessage({ type: 'OMEGA_AUTOPILOT_CMD', auto: auto,
                         mw: o.mw, mwh: o.mwh, mode: o.mode, ptype: o.type },
                       root.location.origin);
      return 'commanded';
    }
    var q = '?address=' + encodeURIComponent(o.address) + '&auto=' + auto + '&from=button';
    if (o.type) q += '&ptype=' + encodeURIComponent(o.type);
    if (o.mw) q += '&mw=' + o.mw;
    if (o.mwh) q += '&mwh=' + o.mwh;
    if (o.mode) q += '&mode=' + o.mode;
    root.location.href = '/editor' + q;
    return 'navigating';
  }

  /* ── make it buildable: evidence in, constrained layout out ──────────── */

  function plan(site) {
    var u = null;
    try { u = firebase.auth().currentUser; } catch (e) {}
    if (!u) return Promise.reject(new Error('Sign in before asking for a constrained layout.'));
    return u.getIdToken().then(function (tok) {
      return fetch('/api/site-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok },
        body: JSON.stringify({ site: site })
      });
    }).then(function (r) {
      return r.text().then(function (t) {
        var j = null; try { j = JSON.parse(t); } catch (e) {}
        if (!r.ok) throw new Error((j && (j.error || j.detail)) || ('HTTP ' + r.status));
        return j;
      });
    });
  }

  /* ── dialog ──────────────────────────────────────────────────────────── */

  var WRAP = 'position:fixed;inset:0;z-index:100005;background:rgba(6,12,20,.62);display:flex;align-items:center;justify-content:center';
  var CARD = 'width:460px;max-width:calc(100vw - 32px);max-height:calc(100vh - 48px);overflow:auto;background:#0C1624;'
    + 'border:1px solid #26364d;border-radius:12px;padding:18px 20px;color:#CBD5E1;'
    + 'font:12.5px/1.6 "IBM Plex Sans",system-ui,sans-serif;box-shadow:0 18px 50px rgba(0,0,0,.5)';
  var FIELD = 'width:100%;background:#08111C;border:1px solid #26364d;border-radius:7px;color:#E2EEF9;'
    + 'padding:7px 9px;font:12.5px "IBM Plex Sans",system-ui,sans-serif;margin-top:3px';
  var BTN = 'border-radius:7px;padding:7px 14px;font:600 12.5px "IBM Plex Sans",system-ui,sans-serif;cursor:pointer';
  var GO = BTN + ';background:#2563EB;border:1px solid #3B82F6;color:#fff';
  var FLAT = BTN + ';background:transparent;border:1px solid #26364d;color:#8FA3B8';

  function label(t) { return el('div', 'color:#8FA3B8;margin-top:11px;font-size:11px;letter-spacing:.3px', t); }

  function open() {
    if (doc.getElementById('dai-wrap')) return;
    var wrap = el('div', WRAP); wrap.id = 'dai-wrap';
    var card = el('div', CARD); card.style.position = 'relative';
    function close() {
      try { doc.removeEventListener('keydown', onKey, true); } catch (e) {}
      try { wrap.remove(); } catch (e) {}
    }
    /* THREE WAYS OUT. Cancel alone was not enough: the scrim only closes on
       an exact hit, and on a short window the card fills it. Escape and a ✕
       are what people actually reach for (Thomas, 2026-09-15). */
    function onKey(e) { if (e.key === 'Escape') { e.preventDefault(); close(); } }
    doc.addEventListener('keydown', onKey, true);
    wrap.onclick = function (e) { if (e.target === wrap) close(); };
    var shut = el('button', 'position:absolute;top:10px;right:10px;background:transparent;border:1px solid #26364d;'
      + 'color:#8FA3B8;border-radius:6px;width:24px;height:24px;line-height:1;cursor:pointer;font-size:13px', '\u2715');
    shut.title = 'Close (Esc)';
    shut.onclick = close;
    card.appendChild(shut);

    card.appendChild(el('div', 'font-weight:700;color:#E2EEF9;font-size:14px', 'Design with AI'));
    var sub = el('div', 'color:#8FA3B8;margin-top:3px');
    sub.textContent = canCommandThisTab()
      ? 'Builds on the site already open in this tab.'
      : 'Loads the address, pulls the parcel and roads, then runs the guided build.';
    card.appendChild(sub);

    var warn = null;
    if (!canCommandThisTab() && hasDrawing()) {
      warn = el('div', 'margin-top:10px;padding:8px 10px;border-radius:7px;background:rgba(245,158,11,.12);'
        + 'border:1px solid #F59E0B;color:#FCD34D');
      warn.textContent = 'This canvas has objects on it. Starting a new site reloads the editor, so save first if you want to keep them.';
      card.appendChild(warn);
    }

    /* FIRST, because it changes what every field below means. */
    card.appendChild(label('SITE TYPE'));
    var ptype = el('select', FIELD);
    types().forEach(function (t) {
      var o = doc.createElement('option');
      o.value = t.key;
      o.textContent = t.label + (does(t.key) === 'site' ? '  — site only' : '');
      ptype.appendChild(o);
    });
    ptype.value = currentType();
    card.appendChild(ptype);
    var ptypeNote = el('div', 'color:#8FA3B8;margin-top:5px;font-size:11px');
    card.appendChild(ptypeNote);

    card.appendChild(label('SITE ADDRESS'));
    var addr = el('input', FIELD); addr.placeholder = '800 Progress Dr, Frederick MD 21701';
    try { addr.value = (doc.getElementById('addr-in') || {}).value || root._lastAddr || ''; } catch (e) {}
    card.appendChild(addr);

    var row = el('div', 'display:flex;gap:10px');
    var mwBox = el('div', 'flex:1'), mwhBox = el('div', 'flex:1');
    mwBox.appendChild(label('SIZE (MW)'));
    var mw = el('input', FIELD); mw.placeholder = 'ask me'; mwBox.appendChild(mw);
    mwhBox.appendChild(label('ENERGY (MWh)'));
    var mwh = el('input', FIELD); mwh.placeholder = 'ask me'; mwhBox.appendChild(mwh);
    row.appendChild(mwBox); row.appendChild(mwhBox);
    card.appendChild(row);

    card.appendChild(label('CONNECTION'));
    var mode = el('select', FIELD);
    [['BTM', 'Behind the meter'], ['FOM', 'Front of meter']].forEach(function (m) {
      var o = doc.createElement('option'); o.value = m[0]; o.textContent = m[1]; mode.appendChild(o);
    });
    card.appendChild(mode);

    /* The whole point of the labelling. Say what the fast answer is before
       it is produced, not in a caveat underneath it afterwards. */
    var note = el('div', 'margin-top:14px;padding:9px 11px;border-radius:7px;background:rgba(96,165,250,.10);'
      + 'border:1px solid #2A4A6B;color:#9FC2E8;font-size:11.5px');
    card.appendChild(note);

    var msg = el('div', 'margin-top:10px;min-height:16px;color:#F59E0B;font-size:11.5px');
    card.appendChild(msg);

    var actions = el('div', 'display:flex;gap:8px;justify-content:flex-end;margin-top:14px');
    var cancel = el('button', FLAT, 'Cancel'); cancel.onclick = close;
    var go = el('button', GO, 'Sketch the site');

    /* Everything the dialog promises depends on the type, so say it here
       and keep saying it as the choice changes. */
    function syncType() {
      var k = ptype.value, d = does(k), noun = 'this';
      types().forEach(function (t) { if (t.key === k) noun = t.noun || t.label; });
      var HAND = {
        ev:   'you place the EV stencils on the stalls you want charged — which stalls is a judgement '
            + 'about that lot, and OpenStreetMap has no traffic data to guess it from.',
        evl2: 'you place the EV stencils on the stalls you want charged.',
        der:  'a microgrid has no single sequence to walk — you pick the assets from Build.',
        datacenter: 'the lineup is sized from the IT load, which this dialog does not ask for.'
      };
      ptypeNote.textContent =
          d === 'build' ? 'Runs the guided build: the battery goes behind the building, then transformer, '
                        + 'disconnect, switchgear, meter — and it stops at the utility connection for you.'
        : d === 'array' ? 'Packs a ground-mount array into the parcel, fitted around the buildings it imports. '
                        + 'No electrical equipment is drawn.'
        :                 'Loads the site and stops: ' + (HAND[k] || 'the next step is yours.');
      note.textContent =
          d === 'build' ? 'This produces a SKETCH: equipment walked out from the building toward the road. It checks the '
                        + 'building footprints it imported, but not setbacks, easements, clearances or obstructions. '
                        + 'Use "Make it buildable" once you have the survey and the service location.'
        : d === 'array' ? 'This produces a SKETCH array: the packing engine fills the parcel at the configured GCR and '
                        + 'setback, with the buildings taken out. It knows nothing about shading, easements or soils.'
        :                 'This produces the SITE only — map, parcel boundary, roads and frontage. No equipment is drawn, '
                        + 'because guessing the wrong technology onto a site is worse than drawing nothing.';
      go.textContent = d === 'build' ? 'Sketch the site' : d === 'array' ? 'Lay out the array' : 'Load the site';
      var sized = (d === 'build');
      mwBox.style.opacity = mwhBox.style.opacity = sized ? '1' : '.45';
      mw.disabled = mwh.disabled = mode.disabled = !sized;
    }
    ptype.onchange = function () { setType(ptype.value); syncType(); };
    syncType();
    go.onclick = function () {
      var a = String(addr.value || '').trim();
      if (!canCommandThisTab()) {
        if (!a) { msg.textContent = 'Enter the site address.'; return; }
        if (!looksLikeAddress(a)) { msg.textContent = 'That is not a street address. A city name alone will not be geocoded.'; return; }
      }
      if (!signedIn()) { msg.textContent = 'Sign in first — the parcel and score both need your token.'; return; }
      go.disabled = true; go.textContent = 'Starting…';
      try {
        setType(ptype.value);
        launch({ address: a, type: ptype.value, mw: num(mw.value), mwh: num(mwh.value), mode: mode.value });
        close();
      } catch (e) {
        go.disabled = false; go.textContent = 'Sketch the site';
        msg.textContent = e.message || 'Could not start.';
      }
    };
    actions.appendChild(cancel); actions.appendChild(go);
    card.appendChild(actions);

    wrap.appendChild(card);
    doc.body.appendChild(wrap);
    try { addr.focus(); } catch (e) {}
  }

  /* ── ribbon ──────────────────────────────────────────────────────────── */

  /* Sits next to Design Site, which is the other "tell me what to build"
     button. Injection polls because the ribbon is rebuilt by mode changes
     and this file loads before either button exists.

     The host matters more than it looks, and being next to the RIGHT button
     is worth less than being on screen at all. 173 ribbon buttons exist on a
     loaded editor and 15 of them are visible: the rest sit on ribbon pages
     for unselected tabs, or are gated by mode. rb-design-site and
     rb-place-sub are both in that hidden majority on a default load, so
     anchoring to either one inherits its invisibility — the button is in the
     DOM at zero by zero pixels, with no error anywhere to say so. That is
     how the first version of this shipped-looking and did nothing.

     So the rule is: take the first candidate that is actually RENDERED, and
     only fall back to a hidden one after waiting, when nothing visible has
     appeared. Preference still runs Design Site first, because that is the
     neighbour this belongs beside whenever that group is the one on screen. */
  var HOSTS = ['rb-design-site', 'rb-bldg-designer', 'rb-place-sub', 'rb-recenter'];
  var WAIT_FOR_VISIBLE = 30;                /* ticks, ~3.6 s at 120 ms */
  function rendered(e) {
    try { var r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; } catch (x) { return false; }
  }
  function pickHost(tick) {
    var i, e, present = null;
    for (i = 0; i < HOSTS.length; i++) {
      e = doc.getElementById(HOSTS[i]);
      if (!e || !e.parentNode) continue;
      if (rendered(e)) return e;
      if (!present) present = e;
    }
    return (tick || 0) >= WAIT_FOR_VISIBLE ? present : null;
  }
  function inject(tick) {
    if (doc.getElementById('rb-design-ai')) return true;
    var host = pickHost(tick);
    if (!host || !host.parentNode) return false;
    var b = doc.createElement('button');
    b.className = 'rbtn'; b.id = 'rb-design-ai';
    b.title = 'Design with AI — load an address, pull the parcel and roads, and sketch the build. '
      + 'The sketch is unverified placement; "Make it buildable" adds the survey and runs the constrained planner.';
    b.onclick = open;
    b.innerHTML = '<span class="rb-ico" style="color:#8B5CF6">✦</span>'
      + '<span class="rb-lbl">Design<br>with AI</span>';
    host.parentNode.insertBefore(b, host.nextSibling);
    try { if (root.OmegaMode && root.OmegaMode.keep) root.OmegaMode.keep(/rb-design-ai/); } catch (e) {}
    return true;
  }

  function boot() {
    var n = 0, iv = setInterval(function () {
      if (inject(n) || ++n > 100) clearInterval(iv);
    }, 120);
    inject(0);
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot);
  else boot();

  root.OmegaDesignAI = { open: open, launch: launch, plan: plan, inject: inject,
                         looksLikeAddress: looksLikeAddress };
  try { if (root.console) console.info(TAG + ' ready'); } catch (e) {}
})(typeof window !== 'undefined' ? window : globalThis);
