/* ══════════════════════════════════════════════════════════════════════
   omega-jarvis-help.js  ·  ClearSky-OMEGA  ·  "Ask Jarvis" in the editor
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   A help window inside Site Map Designer Pro where a user asks Jarvis
   anything about the tool or the site in front of them, and gets an
   answer about THIS drawing, not a doc link (Thomas, 2026-09-12).

   WHAT JARVIS SEES
   Every question carries a snapshot of the situation: the project, what
   is drawn (counts by kind, conduits, trench runs, scale, boundary, map
   state), the RESULTS rail's own gates and numbers, any guided build in
   progress, chargers that have lost their branch, the last few script
   errors, and the ribbon's command list by name. So "why are the results
   not updated" is answered from the stale flag, and "what is missing
   before I export" from the gates the rail is already showing.

   WHAT JARVIS CAN DO
   It proposes actions; the person applies them. Each action is a button
   under the answer — Press Run, open a tab, run a ribbon command by its
   exact name, open Design with AI, reconnect a charger, select an
   object, save. Nothing runs on its own. That is the L2 rung of the
   ladder in the vault (propose; a human applies), and it is what makes
   this safe to put in front of every tenant.

   WHERE THE ANSWERS COME FROM
   /api/jarvis-help — a Firebase ID token in, the situation and the
   question in, a reply and up to three actions out. The tool knowledge
   and the prompt live in the function, never here: browser code is
   readable by every tenant (CLAUDE.md, IP protection).

   THE TWIN
   For a ClearSky account the last exchange can be filed on Jarvis's own
   backlog through the twin's /task door, the same call the mission
   dashboard makes. Tenant users do not see that button; the twin refuses
   them server side anyway.

   ES5. No build step. Loads after omega-design-ai.js in editor.html.
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  var TAG = '[jarvis-help]';
  var doc = root.document;
  var API = '/api/jarvis-help';
  var TWIN = 'https://us-central1-clearsky-portal.cloudfunctions.net/twinChat';
  var STAFF = ['clearsky-usa.com', 'csebuilders.com'];
  var MAX_TURNS = 12;

  /* ── the last few errors, so "it just broke" has a reference ─────────── */
  var errors = [];
  function noteError(kind, msg, src) {
    errors.push({ t: Date.now(), kind: kind, msg: String(msg || '').slice(0, 240), src: String(src || '').slice(0, 120) });
    if (errors.length > 10) errors.shift();
  }
  try {
    root.addEventListener('error', function (e) {
      try { noteError('error', e.message || (e.error && e.error.message) || 'error', (e.filename || '') + ':' + (e.lineno || '')); } catch (x) {}
    });
    root.addEventListener('unhandledrejection', function (e) {
      try { var r = e.reason; noteError('rejection', (r && r.message) || String(r), ''); } catch (x) {}
    });
    var con = root.console, origErr = con && con.error;
    if (typeof origErr === 'function') {
      con.error = function () {
        try {
          noteError('console', Array.prototype.slice.call(arguments).map(function (a) { return (a && a.message) || String(a); }).join(' '), '');
        } catch (x) {}
        return origErr.apply(con, arguments);
      };
    }
  } catch (e) {}

  /* ── helpers ─────────────────────────────────────────────────────────── */
  function S_() { try { return root.S || null; } catch (e) { return null; } }
  function el(tag, css, text) {
    var e = doc.createElement(tag);
    if (css) e.style.cssText = css;
    if (text != null) e.textContent = text;
    return e;
  }
  function txt(id, max) {
    var n = doc.getElementById(id); if (!n) return '';
    var t = (n.innerText || n.textContent || '').replace(/\s+/g, ' ').trim();
    return t.slice(0, max || 600);
  }
  function countBy(arr, keyFn) {
    var m = {};
    (arr || []).forEach(function (o) { var k; try { k = keyFn(o); } catch (e) { k = null; } if (!k) return; m[k] = (m[k] || 0) + 1; });
    return m;
  }
  function user() { try { return root.firebase && firebase.auth().currentUser; } catch (e) { return null; } }
  function isStaff() {
    var u = user(); var d = (u && u.email || '').toLowerCase().split('@')[1] || '';
    return STAFF.indexOf(d) >= 0;
  }
  function token() {
    var u = user();
    if (!u) return Promise.reject(new Error('Sign in to ask Jarvis.'));
    return u.getIdToken();
  }

  /* ── the situation: what Jarvis is told about this tab ───────────────── */
  function projectType() {
    try {
      var P = root.OmegaProjectTypes; if (!P || typeof P.get !== 'function') return null;
      var k = P.get(), label = null;
      if (k && typeof P.list === 'function') P.list().forEach(function (t) { if (t.key === k) label = t.label; });
      return k ? (label || k) : null;
    } catch (e) { return null; }
  }
  function situation() {
    var s = S_() || {};
    var els = s.elements || [];
    var tab = doc.querySelector('#ribbon-tabs .rtab.active');
    var out = {
      at: new Date().toISOString(),
      page: {
        path: root.location.pathname + root.location.search,
        mode: (doc.body && doc.body.classList.contains('omg-designer')) ? 'designer' : 'pro',
        tab: tab ? ((tab.getAttribute('data-page') || '') + ' — ' + (tab.textContent || '').trim()) : '',
        tabs: tabs()
      },
      project: {
        id: root._projectId || null,
        name: s.projectName || s.name || txt('pname', 80) || null,
        address: s.siteAddr || s.address || null,
        type: projectType(),
        unsaved: !!root._workDirty
      },
      drawing: {
        elements: els.length,
        byKind: countBy(els, function (e) {
          return e.type === 'evgear' ? ('ev:' + (e.evKind || '?')) : e.type === 'eq' ? ('eq:' + (e.eqId || '?')) : e.type === 'bess-asm' ? 'bess' : (e.type || '?');
        }),
        conduits: (s.conduits || []).length,
        conduitsByType: countBy(s.conduits, function (c) { return c.condType || '?'; }),
        conduitFt: Math.round((s.conduits || []).reduce(function (a, c) { return a + (+c.ftLen || 0); }, 0)),
        shapes: (s.shapes || []).length,
        shapesByKind: countBy(s.shapes, function (sh) { return sh.kind || '?'; }),
        boundary: (s.shapes || []).some(function (sh) { return !!(sh && sh.isSiteBoundary); }),
        trenchRuns: (s._trenches || []).length,
        scale: s.pxPerFt ? { pxPerFt: +(+s.pxPerFt).toFixed(3), unit: s.unitLabel || 'ft' } : null,
        mapFrozen: !!root._frozenMapImg,
        uploadedPhoto: !!root._isUploadedPhoto,
        liveMap: (function () { var w = doc.getElementById('gmap-wrap'); return !!(w && w.style.display !== 'none'); })(),
        lat: (isFinite(+s.lat) && +s.lat !== 0) ? +s.lat : null,
        lng: (isFinite(+s.lng) && +s.lng !== 0) ? +s.lng : null,
        selected: (function () {
          var e = null; try { e = els.filter(function (x) { return x.id === s.sel; })[0]; } catch (x) {}
          return e ? { label: e.label || '', type: e.type, kind: e.evKind || e.eqId || '', spec: (e.spec || '').slice(0, 120) } : null;
        })()
      },
      results: {
        stale: !!s.resultsStale,
        running: !!s.running,
        lastRunAt: s.lastRunAt ? new Date(s.lastRunAt).toISOString() : null,
        gates: Array.prototype.slice.call(doc.querySelectorAll('#rr .rr-gate')).map(function (n) {
          return (n.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 160);
        }).slice(0, 8),
        site: txt('rr-b-site', 500), power: txt('rr-b-power', 600), flow: txt('rr-b-flow', 400), civil: txt('rr-b-civil', 400)
      },
      builds: (function () {
        var b = {};
        try { var d = typeof root._dcfcState === 'function' ? root._dcfcState() : null; if (d && d.active) b.ev = { phase: d.phase, level2: !!d.level2, chargers: d.chargers, left: d.chargersLeft, step: d.stepIx }; } catch (e) {}
        try { var g = typeof root._bgbState === 'function' ? root._bgbState() : null; if (g && g.active) b.bess = { phase: g.phase, mode: g.mode, step: g.stepIx }; } catch (e) {}
        try { var c = typeof root._cgcState === 'function' ? root._cgcState() : null; if (c && c.active) b.compute = { step: c.ix }; } catch (e) {}
        try { var a = root.__omegaAutopilot; if (a) b.autopilot = { finished: !!a.finished, stopped: !!a.stopped, fatal: a.fatal || null }; } catch (e) {}
        return b;
      })(),
      faults: {
        chargersWithoutBranch: (function () {
          try { return root.OmegaEvReconnect ? root.OmegaEvReconnect.orphans().map(function (o) { return o.charger.label || 'charger'; }) : []; } catch (e) { return []; }
        })(),
        errors: errors.slice(-6).map(function (e) { return { ago: Math.round((Date.now() - e.t) / 1000) + 's', kind: e.kind, msg: e.msg, src: e.src }; }),
        banner: txt('banner', 160)
      }
    };
    return out;
  }

  /* The ribbon by name — the same index Search tools uses, so an action
     Jarvis proposes is a command the person could have found themselves. */
  function commandList() {
    var out = [], seen = {};
    try {
      if (root.OmegaCommands && typeof root.OmegaCommands.list === 'function') {
        root.OmegaCommands.list().forEach(function (c) {
          var k = (c.name || '').toLowerCase(); if (!k || seen[k]) return; seen[k] = 1;
          out.push({ name: c.name, group: c.group || '', page: c.page || '' });
        });
      }
    } catch (e) {}
    return out.slice(0, 220);
  }

  /* ── actions: proposals the person applies with one click ───────────── */
  var ACTIONS = {
    run: { label: 'Press Run', fn: function () {
      if (typeof root.omegaRunDesign === 'function') { root.omegaRunDesign(); return true; }
      var b = doc.getElementById('rr-run'); if (b) { b.click(); return true; } return false; } },
    /* The Build tab's page id is "home", not "build": a page id that is not
       on the ribbon would deactivate every tab, so it is checked first. */
    tab: { label: 'Open the tab', fn: function (a) {
      if (typeof root.rbTab !== 'function' || !a.page || !tabByPage(a.page)) return false;
      root.rbTab(a.page); return true; } },
    command: { label: 'Run command', fn: function (a) {
      if (root.OmegaCommands && typeof root.OmegaCommands.run === 'function') return !!root.OmegaCommands.run(a.name); return false; } },
    design_ai: { label: 'Open Design with AI', fn: function () {
      if (root.OmegaDesignAI && typeof root.OmegaDesignAI.open === 'function') { root.OmegaDesignAI.open(); return true; } return false; } },
    reconnect: { label: 'Reconnect chargers to the panel', fn: function () {
      if (root.OmegaEvReconnect) { root.OmegaEvReconnect.reconnectAll(); return true; } return false; } },
    select: { label: 'Select', fn: function (a) {
      var s = S_(); if (!s) return false;
      var want = String(a.label || a.name || '').toLowerCase();
      var e = (s.elements || []).filter(function (x) { return (x.label || '').toLowerCase() === want; })[0];
      if (e && typeof root.selEl === 'function') { root.selEl(e.id); return true; } return false; } },
    save: { label: 'Save the project', fn: function () { if (typeof root.saveProject === 'function') { root.saveProject(); return true; } return false; } }
  };
  function tabByPage(page) { return doc.querySelector('#ribbon-tabs .rtab[data-page="' + String(page || '').replace(/"/g, '') + '"]'); }
  function tabs() {
    return Array.prototype.slice.call(doc.querySelectorAll('#ribbon-tabs .rtab[data-page]')).map(function (t) {
      return { id: t.getAttribute('data-page'), label: (t.textContent || '').trim() };
    });
  }
  function actionLabel(a) {
    if (a.kind === 'select') return 'Select ' + (a.label || a.name || 'object');
    if (a.kind === 'command') return a.name || 'Run command';
    if (a.kind === 'tab') { var t = tabByPage(a.page); return 'Open the ' + (t ? (t.textContent || '').trim() : (a.page || '')) + ' tab'; }
    return (ACTIONS[a.kind] && ACTIONS[a.kind].label) || a.kind;
  }
  function applyAction(a) {
    var def = ACTIONS[a.kind]; if (!def) return false;
    var ok = false;
    try { ok = !!def.fn(a); } catch (e) { noteError('action', e && e.message, a.kind); ok = false; }
    return ok;
  }

  /* ── the panel ───────────────────────────────────────────────────────── */
  var FONT = '"IBM Plex Sans",system-ui,sans-serif';
  var PANEL = 'position:fixed;right:16px;bottom:16px;width:400px;max-width:calc(100vw - 32px);height:560px;max-height:calc(100vh - 120px);'
    + 'z-index:100004;background:#0C1624;border:1px solid #26364d;border-radius:12px;color:#CBD5E1;display:none;flex-direction:column;'
    + 'font:12.5px/1.55 ' + FONT + ';box-shadow:0 18px 50px rgba(0,0,0,.5);overflow:hidden';
  var HEAD = 'display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid #26364d;background:#0A1320';
  var BTN = 'border-radius:6px;padding:4px 9px;font:600 11.5px ' + FONT + ';cursor:pointer;background:transparent;border:1px solid #26364d;color:#8FA3B8';
  var GO = 'border-radius:7px;padding:7px 14px;font:600 12.5px ' + FONT + ';cursor:pointer;background:#2563EB;border:1px solid #3B82F6;color:#fff';
  var ACT = 'display:inline-block;margin:6px 6px 0 0;border-radius:6px;padding:5px 10px;font:600 11.5px ' + FONT + ';cursor:pointer;'
    + 'background:rgba(37,99,235,.14);border:1px solid #2563EB;color:#BFDBFE';

  var ui = null, hist = [], busy = false;

  function storeKey() { return 'jarvis-help:' + (root._projectId || 'none'); }
  function loadHist() { try { hist = JSON.parse(root.sessionStorage.getItem(storeKey()) || '[]') || []; } catch (e) { hist = []; } }
  function saveHist() { try { root.sessionStorage.setItem(storeKey(), JSON.stringify(hist.slice(-40))); } catch (e) {} }

  function build() {
    if (ui) return ui;
    var box = el('div', PANEL); box.id = 'jarvis-help';
    box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', 'Ask Jarvis');

    var head = el('div', HEAD);
    head.appendChild(el('div', 'width:22px;height:22px;border-radius:6px;background:#2B5FA8;color:#fff;display:grid;place-items:center;font-weight:700;font-size:12px', 'J'));
    var titles = el('div', 'flex:1;min-width:0');
    titles.appendChild(el('div', 'font-weight:700;color:#E2EEF9;font-size:13px', 'Jarvis'));
    var sub = el('div', 'color:#8FA3B8;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis', 'Site Map Designer Pro');
    titles.appendChild(sub);
    head.appendChild(titles);
    var sitBtn = el('button', BTN, 'Situation'); sitBtn.title = 'What Jarvis can see on this tab right now';
    var clrBtn = el('button', BTN, 'Clear'); clrBtn.title = 'Forget this conversation';
    var shut = el('button', BTN + ';width:26px;padding:4px 0', '✕'); shut.title = 'Close (Esc or F1)';
    head.appendChild(sitBtn); head.appendChild(clrBtn); head.appendChild(shut);
    box.appendChild(head);

    var sit = el('pre', 'display:none;margin:0;padding:8px 12px;max-height:180px;overflow:auto;border-bottom:1px solid #26364d;background:#08111C;color:#8FA3B8;font:11px/1.45 "IBM Plex Mono",ui-monospace,monospace;white-space:pre-wrap');
    box.appendChild(sit);

    var thread = el('div', 'flex:1;overflow:auto;padding:12px');
    box.appendChild(thread);

    var quick = el('div', 'padding:0 12px 8px;display:flex;flex-wrap:wrap;gap:6px');
    ['Why are results not updated?', 'What is missing before I can export?', 'Check this drawing for problems', 'How do I draw a trench to a charger?']
      .forEach(function (q) {
        var b = el('button', BTN, q);
        b.onclick = function () { send(q); };
        quick.appendChild(b);
      });
    box.appendChild(quick);

    var foot = el('div', 'display:flex;gap:8px;padding:10px 12px;border-top:1px solid #26364d;background:#0A1320');
    var input = el('textarea', 'flex:1;resize:none;height:44px;background:#08111C;border:1px solid #26364d;border-radius:7px;color:#E2EEF9;padding:7px 9px;font:12.5px ' + FONT);
    input.placeholder = 'Ask about this site or the tool…  (Enter to send, Shift+Enter for a new line)';
    input.setAttribute('aria-label', 'Ask Jarvis');
    var sendBtn = el('button', GO, 'Ask');
    foot.appendChild(input); foot.appendChild(sendBtn);
    box.appendChild(foot);

    doc.body.appendChild(box);

    sendBtn.onclick = function () { send(input.value); };
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input.value); }
      else if (e.key === 'Escape') { e.preventDefault(); close(); }
      e.stopPropagation();   /* the editor's own shortcuts must not fire while typing here */
    });
    input.addEventListener('keyup', function (e) { e.stopPropagation(); });
    input.addEventListener('keypress', function (e) { e.stopPropagation(); });
    sitBtn.onclick = function () {
      if (sit.style.display === 'none') { sit.textContent = JSON.stringify(situation(), null, 1); sit.style.display = 'block'; }
      else sit.style.display = 'none';
    };
    clrBtn.onclick = function () { hist = []; saveHist(); thread.innerHTML = ''; empty(); };
    shut.onclick = close;

    ui = { box: box, sub: sub, thread: thread, input: input, sendBtn: sendBtn, quick: quick, sit: sit };
    return ui;
  }

  function empty() {
    if (!ui || ui.thread.childNodes.length) return;
    var e = el('div', 'color:#8FA3B8;padding:6px 2px 10px');
    e.textContent = 'Ask about the drawing in front of you, a gate on the RESULTS rail, or how a tool works. Jarvis sees this tab, proposes actions, and you apply them.';
    ui.thread.appendChild(e);
  }

  function bubble(role, text, meta) {
    var row = el('div', 'margin:0 0 10px;display:flex;gap:8px;align-items:flex-start' + (role === 'you' ? ';flex-direction:row-reverse' : ''));
    var av = el('div', 'flex:none;width:20px;height:20px;border-radius:5px;display:grid;place-items:center;font-weight:700;font-size:10.5px;'
      + (role === 'you' ? 'background:#1E293B;color:#94A3B8' : 'background:#2B5FA8;color:#fff'), role === 'you' ? 'You' : 'J');
    var wrap = el('div', 'max-width:86%;min-width:0');
    var b = el('div', 'padding:8px 10px;border-radius:9px;white-space:pre-wrap;word-wrap:break-word;'
      + (role === 'you' ? 'background:#16233A;color:#E2EEF9' : 'background:#111C2E;border:1px solid #1E3A5F;color:#DCE6F2'));
    b.textContent = text || '';   /* textContent: replies quote labels people typed */
    wrap.appendChild(b);
    if (meta) wrap.appendChild(el('div', 'color:#5B6C82;font-size:10.5px;margin:3px 2px 0', meta));
    row.appendChild(av); row.appendChild(wrap);
    ui.thread.appendChild(row);
    ui.thread.scrollTop = ui.thread.scrollHeight;
    return { row: row, wrap: wrap };
  }

  function money(n) { if (n == null) return ''; if (n === 0) return '$0'; if (n < 0.01) return '<$0.01'; return '$' + Number(n).toFixed(2); }

  function renderActions(wrap, actions) {
    if (!actions || !actions.length) return;
    var host = el('div', 'margin-top:2px');
    actions.forEach(function (a) {
      if (!ACTIONS[a.kind]) return;
      var b = el('button', ACT, actionLabel(a));
      if (a.why) b.title = a.why;
      b.onclick = function () {
        var ok = applyAction(a);
        b.disabled = true;
        b.style.opacity = '.6';
        b.textContent = (ok ? '✓ ' : '✗ ') + actionLabel(a);
        if (!ok) b.title = 'That command is not available on this tab right now.';
        hist.push({ role: 'note', text: (ok ? 'Applied: ' : 'Could not apply: ') + actionLabel(a) });
        saveHist();
      };
      host.appendChild(b);
    });
    if (host.childNodes.length) wrap.appendChild(host);
  }

  function renderFile(wrap, question, reply) {
    if (!isStaff()) return;
    var b = el('button', BTN + ';margin-top:6px', 'File with Jarvis');
    b.title = 'Put this on the twin’s backlog (ClearSky accounts only)';
    b.onclick = function () {
      b.disabled = true; b.textContent = 'Filing…';
      var s = situation();
      var title = 'Editor help: ' + (s.project.name || 'untitled') + ' — ' + question.slice(0, 120);
      token().then(function (t) {
        return fetch(TWIN + '/task', { method: 'POST',
          headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: title + ' — ' + reply.slice(0, 200), urgency: 'queue' }) });
      }).then(function (r) {
        if (r.status === 403) throw new Error('This account is not allowed to talk to Jarvis.');
        if (!r.ok) throw new Error('HTTP ' + r.status);
        b.textContent = '✓ On the backlog';
      })['catch'](function (e) { b.disabled = false; b.textContent = 'File with Jarvis'; b.title = e.message; });
    };
    wrap.appendChild(b);
  }

  function paint() {
    ui.thread.innerHTML = '';
    hist.forEach(function (h) {
      if (h.role === 'note') { ui.thread.appendChild(el('div', 'color:#5B6C82;font-size:10.5px;margin:-6px 0 10px 28px', h.text)); return; }
      var b = bubble(h.role === 'user' ? 'you' : 'jarvis', h.text, h.meta || '');
      if (h.role === 'assistant') { renderActions(b.wrap, h.actions); }
    });
    empty();
  }

  function send(text) {
    text = String(text || '').trim();
    if (!text || busy) return;
    build();
    ui.input.value = '';
    ui.quick.style.display = 'none';
    busy = true; ui.sendBtn.disabled = true;
    hist.push({ role: 'user', text: text }); saveHist();
    bubble('you', text);
    var pending = bubble('jarvis', 'Looking at the drawing…');
    var body = {
      message: text,
      situation: situation(),
      history: hist.filter(function (h) { return h.role === 'user' || h.role === 'assistant'; }).slice(-MAX_TURNS - 1, -1)
        .map(function (h) { return { role: h.role, text: h.text }; }),
      commands: commandList()
    };
    token().then(function (t) {
      return fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t }, body: JSON.stringify(body) });
    }).then(function (r) {
      return r.text().then(function (raw) {
        var j = null; try { j = JSON.parse(raw); } catch (e) {}
        if (r.status === 401) throw new Error('Your session could not be verified. Reload and sign in again.');
        if (!r.ok) throw new Error((j && j.error) || ('Jarvis answered HTTP ' + r.status + '.'));
        return j || {};
      });
    }).then(function (j) {
      pending.row.parentNode.removeChild(pending.row);
      var meta = [j.costUsd != null ? money(j.costUsd) : '', j.confidence === 'guessing' ? 'guessing' : ''].filter(Boolean).join(' · ');
      var entry = { role: 'assistant', text: j.reply || 'No answer.', actions: (j.actions || []).filter(function (a) { return a && ACTIONS[a.kind]; }), meta: meta };
      hist.push(entry); saveHist();
      var b = bubble('jarvis', entry.text, meta);
      renderActions(b.wrap, entry.actions);
      renderFile(b.wrap, text, entry.text);
    })['catch'](function (e) {
      pending.row.parentNode.removeChild(pending.row);
      var msg = (e && e.message) || 'Jarvis is unreachable right now.';
      hist.push({ role: 'assistant', text: msg, actions: [] }); saveHist();
      bubble('jarvis', msg);
      try { console.warn(TAG, msg); } catch (x) {}
    }).then(function () {
      busy = false; ui.sendBtn.disabled = false;
      try { ui.input.focus(); } catch (e) {}
    });
  }

  function open() {
    build();
    loadHist();
    ui.sub.textContent = (function () { var s = situation(); return (s.project.name || 'No project open') + (s.project.type ? ' · ' + s.project.type : ''); })();
    ui.box.style.display = 'flex';
    paint();
    ui.quick.style.display = hist.length ? 'none' : 'flex';
    setTimeout(function () { try { ui.input.focus(); } catch (e) {} }, 20);
  }
  function close() { if (ui) ui.box.style.display = 'none'; }
  function isOpen() { return !!(ui && ui.box.style.display !== 'none'); }
  function toggle() { isOpen() ? close() : open(); }

  /* ── the way in: a chip in the title bar and F1 ─────────────────────── */
  function addChip() {
    var right = doc.querySelector('#tb .tb-right');
    if (!right || doc.getElementById('omega-jarvis-chip')) return !!right;
    var d = el('div', 'display:inline-flex;align-items:center;gap:6px;margin-right:8px;padding:3px 9px;border:1px solid #26364d;border-radius:7px;cursor:pointer;color:#C7D4E2;font:600 11.5px ' + FONT);
    d.id = 'omega-jarvis-chip';
    d.title = 'Ask Jarvis about this site or the tool (F1)';
    d.appendChild(el('span', 'width:16px;height:16px;border-radius:4px;background:#2B5FA8;color:#fff;display:grid;place-items:center;font-size:10px;font-weight:700', 'J'));
    d.appendChild(el('span', '', 'Ask Jarvis'));
    d.appendChild(el('kbd', 'font:10px ui-monospace,monospace;color:#8FA3B8;border:1px solid #26364d;border-radius:4px;padding:0 4px', 'F1'));
    d.addEventListener('click', toggle);
    var search = doc.getElementById('omega-search');
    if (search && search.parentNode === right) right.insertBefore(d, search); else right.insertBefore(d, right.firstChild);
    return true;
  }
  (function () {
    var tries = 0;
    var iv = setInterval(function () { if (addChip() || ++tries > 60) clearInterval(iv); }, 250);
  })();
  doc.addEventListener('keydown', function (e) {
    if (e.key === 'F1') { e.preventDefault(); e.stopPropagation(); toggle(); }
  }, true);

  root.OmegaJarvisHelp = { open: open, close: close, toggle: toggle, ask: send, situation: situation, commands: commandList, apply: applyAction, actions: ACTIONS };
})(typeof window !== 'undefined' ? window : this);
