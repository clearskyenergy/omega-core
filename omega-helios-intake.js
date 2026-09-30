/* omega-helios-intake.js — Helios Energy Advisors' first-pass checklist,
   from the editor.
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   Helios asks a developer eighteen questions, an attachment list and a
   status block before it looks at a deal. This is the Output tab's "Helios
   Intake": it gathers what THIS editor session knows (the drawing, the
   parcel lookup, Grid Atlas, the substation lookup, the terrain sample, the
   Viability Workflow's answers, the project mode), asks the server to draft
   the answers with a source under each one, lets the person finish and
   correct the rest, previews Helios's own PDF filled in, and sends it to
   Helios with the person in copy.

   The BROWSER only collects and shows. Composing the answers, filling the
   PDF, storing it and mailing it are api/helios-intake.js (one door), so
   the form's field map and the wording live in one place, and a browser
   cannot mail anything itself. Nothing here writes to Firestore.

   ES5 on purpose (CLAUDE.md): var, function, promises. Loads in the editor
   only; every editor global it reads is behind a guard, so a build that
   lacks one still opens the dialog with that fact blank. */
(function (root) {
  'use strict';
  var API = '/api/helios-intake';
  var HOST_ID = 'helios-modal';
  var draftState = null;   /* the server's draft, kept for the questions and the labels */

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function S_() { return root.S || {}; }
  function val(id) { var e = document.getElementById(id); return e ? String(e.value || '').trim() : ''; }
  function first(list) { return (list && list.length) ? list[0] : null; }

  /* ── the Viability Workflow's answers, read without creating a store ──
     (vwActive() writes a blank scenario when none exists; reading the
     record directly has no side effect) */
  function workflow(pid) {
    try {
      var raw = localStorage.getItem('omega.vw.' + (pid || '__unsaved__'));
      if (!raw) return null;
      var st = JSON.parse(raw) || {};
      var sc = st.scenarios && st.scenarios[st.activeId];
      var d = (sc && sc.data) || {};
      var research = (root.VW && root.VW.research) || {};
      return { owner: d.p0_owner, siteControl: d.p0_site_control, utility: d.p0_utility, flood: d.p0_flood,
               pathFinal: d.p2_path_final, appStatus: d.p4_app_status, queuePos: d.p4_queue_pos, timeline: d.p4_timeline,
               ahj: d.p5_ahj, fireDept: d.p5_fire_dept, zoning: d.p5_zoning, notes: d.p5_notes, codDate: d.p8_cod_date,
               updatedAt: sc ? sc.updatedAt : null, researchUtility: research.utility || null, researchFloodZone: research.floodZone || null };
    } catch (e) { return null; }
  }

  /* ── what this session knows: read, never computed here ─────────── */
  function collect() {
    var S = S_(), pid = root._projectId || null, f = { projectId: pid };
    f.name = val('pname'); f.address = val('addr-in');
    try { var cs = (typeof root.mktSiteCityState === 'function') ? root.mktSiteCityState() : null; if (cs) { f.city = cs.city; f.state = cs.state; } } catch (e) {}
    var D = root._SITE_DATA || {};
    f.site = { county: D.county, state: D.state, zip: D.zip, parcelApn: D.parcelApn, parcelAcres: D.parcelAcres, parcelOwner: D.parcelOwner,
               parcelZoning: D.parcelZoning, parcelSource: D.parcelSource, ahjName: D.ahjName, ahjPermitDays: D.ahjPermitDays };
    f.gridAtlas = D.gridAtlas || null;
    var g = S.grid || {};
    f.grid = { substations: (g.substations || []).slice(0, 3), lines: (g.lines || []).slice(0, 3), ranAt: g.ranAt || null };
    f.substationLookup = S.substationLookup || null;
    var dr = {}; try { dr = (typeof root.mktDrawingSummary === 'function') ? root.mktDrawingSummary() : {}; } catch (e) { dr = {}; }
    var fleet = null; try { fleet = (typeof root.omegaBessFleet === 'function') ? root.omegaBessFleet() : null; } catch (e) { fleet = null; }
    var hasBoundary = false, shapes = S.shapes || [];
    for (var i = 0; i < shapes.length; i++) { if (shapes[i] && shapes[i].omegaRole === 'boundary') { hasBoundary = true; break; } }
    f.drawing = { tech: dr.tech, solarKwDc: dr.solarKwDc, solarKwAc: dr.spec ? dr.spec.solarKwAc : null,
                  bessKw: dr.bessKw || (fleet && fleet.kw) || null, bessKwh: dr.bessKwh || (fleet && fleet.kwh) || null,
                  evPorts: dr.evPorts, itKw: dr.itKw, capex: dr.capex, units: fleet ? fleet.units : null,
                  elements: (S.elements || []).length, hasBoundary: hasBoundary };
    var b0 = first(S.bessList) || {};
    f.bess = { chem: b0.chem, mfr: b0.mfr, model: b0.model };
    var r = S.costRollup || null;
    f.run = { total: r ? r.capex : (+root._COST_TOTAL || null), at: r ? r.at : (S.lastRunAt || null), contracted: r ? !!r.contracted : !!root._COST_IS_CONTRACTED };
    f.wizMode = root._wizMode || S.wizMode || null;
    f.interconMode = S.interconMode || null;
    f.offtaker = S.offtaker || null;
    f.billImport = S.billImport || null;
    try {
      var J = root.OmegaPQJurisdiction;
      if (J && typeof J.jurisdiction === 'function' && f.address) {
        var jr = J.jurisdiction(null, f.address);
        if (jr) f.jurisdiction = { state: jr.state, utility: jr.utility, known: jr.known, multiUtility: jr.multiUtility };
      }
    } catch (e) {}
    var t = S.terrain || null; if (t) f.terrain = { reliefFt: t.reliefFt, areaFt2: t.areaFt2 };
    f.workflow = workflow(pid);
    f.autopilot = S.autopilot || null;
    f.hasMap = !!(root._gmap || root._frozenMapImg);
    return f;
  }

  /* ── the one door ─────────────────────────────────────────────────── */
  function token() {
    var u = root._currentUser || (root.firebase && root.firebase.auth && root.firebase.auth().currentUser);
    return u ? u.getIdToken() : Promise.reject(new Error('Sign in to prepare a Helios intake.'));
  }
  function post(body) {
    return token().then(function (tok) {
      return fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok }, body: JSON.stringify(body) });
    }).then(function (r) {
      return r.text().then(function (t) {
        var j = null; try { j = JSON.parse(t); } catch (e) {}
        if (!r.ok) throw new Error((j && j.error) || ('HTTP ' + r.status));
        return j || {};
      });
    });
  }

  /* ── a snapshot of the site map for the mail (JPEG, kept small) ──── */
  function snapshot() {
    return new Promise(function (resolve) {
      try {
        var sc = document.getElementById('sc');
        if (!sc || typeof root._captureCanvasWithSVG !== 'function' || typeof root.html2canvas === 'undefined') return resolve(null);
        root._captureCanvasWithSVG(sc, { useCORS: true, allowTaint: true, scale: 1, backgroundColor: '#F5F0E8', logging: false }).then(function (cvs) {
          var q = 0.82, url = cvs.toDataURL('image/jpeg', q);
          while (url.length > 1800000 && q > 0.45) { q -= 0.12; url = cvs.toDataURL('image/jpeg', q); }
          if (url.length > 2400000) {
            var k = Math.sqrt(2000000 / url.length), c2 = document.createElement('canvas');
            c2.width = Math.max(1, Math.round(cvs.width * k)); c2.height = Math.max(1, Math.round(cvs.height * k));
            c2.getContext('2d').drawImage(cvs, 0, 0, c2.width, c2.height);
            url = c2.toDataURL('image/jpeg', 0.7);
          }
          resolve(url.length > 3000000 ? null : url);
        }).catch(function () { resolve(null); });
      } catch (e) { resolve(null); }
    });
  }

  /* ── the dialog ───────────────────────────────────────────────────── */
  function host() {
    var h = document.getElementById(HOST_ID);
    if (!h) {
      h = document.createElement('div'); h.id = HOST_ID;
      h.setAttribute('style', 'position:fixed;inset:0;background:rgba(6,12,22,.82);z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px');
      h.onclick = function (e) { if (e.target === h) close(); };
      document.body.appendChild(h);
    }
    return h;
  }
  function close() { var h = document.getElementById(HOST_ID); if (h) h.remove(); }
  function panel(inner) {
    return '<div style="background:var(--panel);border:1px solid var(--border);border-radius:12px;max-width:820px;width:100%;max-height:92vh;overflow:auto;box-shadow:0 20px 60px rgba(0,0,0,.6);color:var(--text)">' + inner + '</div>';
  }
  function header(sub) {
    return '<div style="padding:16px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;gap:12px">'
      + '<div><div style="font-size:16px;font-weight:800;color:var(--text)">☀ Helios Intake — Large Land Deal First Pass Checklist</div>'
      + '<div style="font-size:10.5px;color:#64748B;margin-top:2px">' + esc(sub) + '</div></div>'
      + '<button onclick="OmegaHeliosIntake.close()" style="background:none;border:none;color:#64748B;font-size:20px;cursor:pointer;line-height:1">×</button></div>';
  }
  var INP = 'width:100%;background:var(--navy);border:1px solid var(--border);color:var(--text);border-radius:5px;padding:6px 8px;font-size:11.5px;font-family:inherit;line-height:1.45';
  function lbl(t) { return '<div style="font-size:9.5px;color:#64748B;text-transform:uppercase;letter-spacing:.4px;margin:0 0 3px">' + t + '</div>'; }
  function src(sources, blank) {
    if (sources && sources.length) return '<div style="font-size:10px;color:#22C55E;margin:3px 0 0">From ' + esc(sources.join('; ')) + '</div>';
    return '<div style="font-size:10px;color:#94A3B8;margin:3px 0 0">' + (blank || 'Not on the project — please answer, or leave blank') + '</div>';
  }
  function ta(id, value, rows) { return '<textarea id="' + id + '" rows="' + (rows || 2) + '" style="' + INP + ';resize:vertical">' + esc(value || '') + '</textarea>'; }
  function inp(id, value, ph) { return '<input id="' + id + '" value="' + esc(value || '') + '" placeholder="' + esc(ph || '') + '" style="' + INP + '">'; }

  function render(d) {
    var dr = d.draft || {}, cover = dr.cover || {}, ans = dr.answers || {}, st = dr.status || {}, att = dr.attachments || {};
    var Q = dr.questions || {}, AL = dr.attachmentLabels || {};
    var h = header('Filled from this project where OMEGA knows the answer, with the source under each one. Finish the rest, preview the PDF, then send it to Helios. Blank means the platform does not know; it never writes "Unknown" for you.');
    var body = '<div style="padding:16px 20px">';
    /* where it goes */
    if (d.configured) {
      body += '<div style="margin-bottom:12px;padding:9px 11px;background:var(--navy);border:1px solid var(--border);border-radius:8px;font-size:11px;color:var(--sub)">Sends to <strong style="color:var(--text)">' + esc((d.to || []).join(', ')) + '</strong> with you and ClearSky in copy'
        + (d.lastSent && d.lastSent.sentAt ? ' · last sent ' + esc(String(d.lastSent.sentAt).slice(0, 10)) + ' by ' + esc(d.lastSent.sentBy || '') : '') + '</div>';
    } else {
      body += '<div style="margin-bottom:12px;padding:9px 11px;background:rgba(251,191,36,.08);border:1px solid rgba(251,191,36,.4);border-radius:8px;font-size:11px;color:#FDE68A;line-height:1.6">No Helios intake address is configured on this deployment yet. You can still finish and preview the form; ask ClearSky to set the Helios address before sending.</div>';
    }
    /* cover */
    body += '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px">'
      + '<div style="flex:2 1 260px">' + lbl('Submitted by') + ta('hi-submittedBy', cover.submittedBy, 3) + '</div>'
      + '<div style="flex:2 1 260px">' + lbl('Project name and location') + ta('hi-projectNameLocation', cover.projectNameLocation, 3) + '</div>'
      + '<div style="flex:0 1 110px">' + lbl('Submission date') + inp('hi-date', cover.date, 'm/d/yy') + '</div></div>';
    /* the questions, in the form's sections */
    var sections = [['Project and Property', ['q1', 'q2', 'q3', 'q4', 'q5']], ['Utility and Grid Connection', ['q6', 'q7', 'q8', 'q9', 'q10', 'q11', 'q12']],
                    ['Power Buyer', ['q13', 'q14', 'q15']], ['Permitting and Site Concerns', ['q16', 'q17', 'q18']]];
    var rowsFor = { q5: 3, q8: 3, q9: 3, q10: 3, q11: 3, q12: 3, q16: 3, q17: 3, q18: 3 };
    sections.forEach(function (sec) {
      body += '<div style="font-size:10px;font-weight:800;color:#64748B;letter-spacing:.5px;margin:14px 0 7px">' + esc(sec[0]).toUpperCase() + '</div>';
      sec[1].forEach(function (q) {
        var a = ans[q] || {}, n = q.slice(1);
        body += '<div style="margin-bottom:10px">' + lbl(n + '. ' + esc(Q[q] || q)) + ta('hi-' + q, a.text, rowsFor[q] || 2) + src(a.sources) + '</div>';
      });
    });
    /* attachments */
    body += '<div style="font-size:10px;font-weight:800;color:#64748B;letter-spacing:.5px;margin:14px 0 7px">ATTACHMENTS FOR THE FIRST PASS <span style="font-weight:400;text-transform:none;letter-spacing:0;color:var(--sub)">— tick what you will send; pre-ticked where OMEGA can supply it</span></div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 14px;font-size:11px;color:var(--text)">';
    Object.keys(AL).forEach(function (k) {
      var a = att[k] || {};
      body += '<label style="display:flex;gap:7px;align-items:flex-start;cursor:pointer"><input type="checkbox" id="hi-att-' + k + '"' + (a.on ? ' checked' : '') + ' style="margin-top:2px"><span>' + esc(AL[k]) + (a.why ? '<div style="font-size:9.5px;color:#64748B">' + esc(a.why) + '</div>' : '') + '</span></label>';
    });
    body += '</div>';
    var canSnap = !!(root.html2canvas && typeof root._captureCanvasWithSVG === 'function' && document.getElementById('sc'));
    body += '<label style="display:flex;gap:7px;align-items:center;margin:10px 0 0;font-size:11px;color:var(--text);cursor:pointer"><input type="checkbox" id="hi-snapshot"' + (canSnap ? ' checked' : ' disabled') + '> Attach a snapshot of the site map (JPEG) to the email'
      + (canSnap ? '' : ' <span style="color:#64748B">— no map in this session</span>') + '</label>';
    /* status */
    body += '<div style="font-size:10px;font-weight:800;color:#64748B;letter-spacing:.5px;margin:16px 0 7px">PROJECT STATUS</div><div style="display:flex;gap:10px;flex-wrap:wrap">';
    [['constructionStart', 'Target construction start'], ['cod', 'Target commercial operation date'], ['totalCost', 'Estimated total project cost'], ['financing', 'Amount and type of financing requested']].forEach(function (p) {
      var s = st[p[0]] || {};
      body += '<div style="flex:1 1 300px">' + lbl(p[1]) + inp('hi-st-' + p[0], s.text, '') + src(s.sources, p[0] === 'financing' ? 'Only you know this — amount and type (construction, term, tax equity…)' : 'Not on the project — please answer, or leave blank') + '</div>';
    });
    body += '</div>';
    /* message + actions */
    body += '<div style="margin:14px 0 6px">' + lbl('Message to Helios (optional)') + ta('hi-message', '', 2) + '</div>'
      + '<div style="font-size:10px;color:#64748B;line-height:1.65;margin:8px 0 12px">Preview fills Helios’s own PDF with what is above and opens it. Send emails that PDF to Helios, keeps a copy on this project, and puts your address in copy so their reply reaches you.</div>'
      + '<div style="display:flex;gap:8px;flex-wrap:wrap">'
      + '<button id="hi-preview" onclick="OmegaHeliosIntake.preview()" style="flex:1 1 180px;padding:10px;border-radius:8px;cursor:pointer;font-family:inherit;font-weight:700;font-size:12px;background:rgba(56,189,248,.14);border:1px solid rgba(56,189,248,.5);color:#BAE6FD">Preview the filled PDF</button>'
      + '<button id="hi-send" onclick="OmegaHeliosIntake.send()"' + (d.configured ? '' : ' disabled') + ' style="flex:1 1 180px;padding:10px;border-radius:8px;cursor:' + (d.configured ? 'pointer' : 'not-allowed') + ';font-family:inherit;font-weight:700;font-size:12px;background:' + (d.configured ? 'rgba(74,222,128,.16)' : 'rgba(100,116,139,.14)') + ';border:1px solid ' + (d.configured ? 'rgba(74,222,128,.5)' : 'rgba(100,116,139,.4)') + ';color:' + (d.configured ? '#86EFAC' : '#64748B') + '">✉ Send to Helios</button>'
      + '</div><div id="hi-log" style="margin-top:12px;font-size:11px;line-height:1.7;color:var(--sub)"></div></div>';
    return panel(h + body);
  }

  function readDraft() {
    var d = { cover: { submittedBy: val('hi-submittedBy'), projectNameLocation: val('hi-projectNameLocation'), date: val('hi-date') }, answers: {}, status: {}, attachments: {} };
    var dr = draftState && draftState.draft || {};
    Object.keys(dr.questions || {}).forEach(function (q) { d.answers[q] = val('hi-' + q); });
    ['constructionStart', 'cod', 'totalCost', 'financing'].forEach(function (k) { d.status[k] = val('hi-st-' + k); });
    Object.keys(dr.attachmentLabels || {}).forEach(function (k) { var e = document.getElementById('hi-att-' + k); d.attachments[k] = !!(e && e.checked); });
    return d;
  }
  function log(html, color) { var l = document.getElementById('hi-log'); if (l) l.innerHTML = '<span style="color:' + (color || 'var(--sub)') + '">' + html + '</span>'; }
  function busy(on) { ['hi-preview', 'hi-send'].forEach(function (id) { var b = document.getElementById(id); if (b && (id !== 'hi-send' || (draftState && draftState.configured))) b.disabled = !!on; }); }

  function open() {
    var pid = root._projectId || null;
    if (!pid) { alert('Save the project first — the Helios intake reads the saved project record.'); return; }
    var h = host();
    h.innerHTML = panel(header('Reading the project…') + '<div style="padding:22px;font-size:12px;color:var(--sub)">Gathering what this project knows: the drawing, the parcel, Grid Atlas, the workflow…</div>');
    var facts = null;
    try { facts = collect(); } catch (e) { facts = { projectId: pid }; }
    post({ projectId: pid, action: 'draft', facts: facts }).then(function (d) {
      draftState = d; h.innerHTML = render(d);
    }).catch(function (e) {
      h.innerHTML = panel(header('Could not prepare the intake') + '<div style="padding:22px;color:#FCA5A5;font-size:12px;line-height:1.7">' + esc(e.message || String(e)) + '</div>');
    });
  }

  function preview() {
    if (!draftState) return;
    busy(true); log('Filling Helios’s form…');
    post({ projectId: root._projectId, action: 'preview', draft: readDraft() }).then(function (r) {
      var bin = atob(r.pdfBase64 || ''), arr = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      var url = URL.createObjectURL(new Blob([arr], { type: 'application/pdf' }));
      var w = null; try { w = window.open(url, '_blank'); } catch (e) { w = null; }
      var trunc = (r.report || []).filter(function (x) { return x.truncated; }).map(function (x) { return x.question.replace('q', ''); });
      log((w ? 'Preview opened in a new tab. ' : '') + '<a href="' + url + '" target="_blank" rel="noopener" style="color:#BAE6FD">Open the filled PDF</a> · <a href="' + url + '" download="' + esc(r.fileName || 'Helios-First-Pass.pdf') + '" style="color:#BAE6FD">Download</a>'
        + (trunc.length ? '<br><span style="color:#FDE68A">Question' + (trunc.length > 1 ? 's ' : ' ') + trunc.join(', ') + ' did not fit the printed lines and ' + (trunc.length > 1 ? 'were' : 'was') + ' cut short — shorten the answer or put the detail in the message.</span>' : ''));
      busy(false);
    }).catch(function (e) { busy(false); log(esc(e.message || String(e)), '#FCA5A5'); });
  }

  function send() {
    if (!draftState || !draftState.configured) return;
    var to = (draftState.to || []).join(', ');
    if (!confirm('Send the filled checklist to Helios?\n\nTo: ' + to + '\nYour address and ClearSky are in copy. A copy of the PDF is kept on this project.')) return;
    busy(true); log('Preparing the attachment…');
    var wantSnap = !!(document.getElementById('hi-snapshot') && document.getElementById('hi-snapshot').checked);
    (wantSnap ? snapshot() : Promise.resolve(null)).then(function (jpeg) {
      log('Sending to Helios…');
      return post({ projectId: root._projectId, action: 'send', draft: readDraft(), message: val('hi-message'), siteMapJpeg: jpeg || undefined });
    }).then(function (r) {
      busy(false);
      var b = document.getElementById('hi-send'); if (b) { b.disabled = true; b.textContent = '✓ Sent'; }
      log('Sent to <strong style="color:var(--text)">' + esc((r.sentTo || []).join(', ')) + '</strong> with ' + esc((r.cc || []).join(', ')) + ' in copy. ' + esc(r.fileName || '') + ' is saved on this project.', '#86EFAC');
    }).catch(function (e) { busy(false); log(esc(e.message || String(e)), '#FCA5A5'); });
  }

  root.OmegaHeliosIntake = { open: open, close: close, preview: preview, send: send, collect: collect, workflow: workflow, API: API };
})(typeof window !== 'undefined' ? window : this);
