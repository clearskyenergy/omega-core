/* omega-core-qualify.js — Output › Omega-Core, in the editor.
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   Omega-Core is ClearSky's skid — a Solela Edge Compute cabinet (75 kW) and
   a CleanCell R60 battery (61.44 kWh / 60 kW Sol-Ark) on one 336 x 87 in
   frame — set on an EV charging site on ITS OWN UTILITY METER, paying the
   host a land lease so the charging site earns more. Five-year minimum; at
   the end the skid comes out and the meter is turned off, or the host buys
   it at fair market value.

   This dialog takes what this session already knows — the Run (S.costRollup
   and the cost sheet's own totals), the drawing (skids placed, chargers, the
   host's compute, the service, the transformer from the site intake), the
   site point, the fiber already found on the project — fans out for the
   evidence through OmegaComputeLease.evidence (Grid Atlas, Network Proximity,
   the parcel: the same three lookups the Land Lease panel runs), asks the
   rep the handful of things no data source holds, and posts it all to
   /api/omega-core. Everything that decides anything — the three gates, how
   many skids, the lease card, the buyout band — is on the other side of that
   call (CLAUDE.md, IP protection). If you find yourself adding a number
   here, it belongs in api/_lib/omega-core.js.

   The same answer carries the skid's own compute economics (the iQGen 75 kW
   cash-flow workbook, white-labelled Omega Core Skid: api/_lib/
   omega-compute-model.js) — capacity by chipset, the 60-month levered cash
   flow, bankability, every chipset side by side, the sensitivity grid. The
   rep may change the chipset, the pricing basis, utilisation, electricity,
   the CAPEX basis, the debt and whether the host's rent is a cost of the
   skid; every rate and price stays on the server. Print gives a CUSTOMER
   VERSION (results and assumptions in plain words) or the FULL REPORT (the
   staff build-up where the server disclosed it).

   An answer the rep edits re-scores against the evidence already gathered:
   it never re-runs a 55-second fiber lookup. The rep's answers and the last
   verdict ride on the project as S.omegaCore (saved in saveProject's
   allowlist, restored in _loadProject).

   ES5 on purpose (CLAUDE.md): var, function, promises. Every editor global it
   reads is behind a guard, so a build that lacks one still opens the dialog
   with that fact blank. */
(function (root) {
  'use strict';
  if (root.OmegaCoreQualify) return;

  var API = '/api/omega-core';
  var HOST_ID = 'omega-core-modal';
  var st = { facts: null, evidence: null, evidenceKey: null, result: null, sources: {}, busy: false, refused: false,
             gen: 0, dirty: {} };
  /* A request answers the dialog that asked, or nothing: closed, reopened or
     on another project, its answer is dropped before it reads a field or
     writes S.omegaCore. */
  function live(gen, pid) {
    return gen === st.gen && pid === (root._projectId || null) && !!document.getElementById(HOST_ID);
  }

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function S_() { return root.S || {}; }
  function val(id) { var e = document.getElementById(id); return e ? String(e.value || '').trim() : ''; }
  function num(v) { var n = Number(v); return (v === '' || v == null || !isFinite(n)) ? null : n; }
  function money(n) { return n == null ? '—' : '$' + Math.round(n).toLocaleString('en-US'); }
  function iso(t) { try { var d = t ? new Date(t) : null; return d && isFinite(d.getTime()) ? d.toISOString() : null; } catch (e) { return null; } }
  function kw(n) { return n == null ? '—' : Math.round(n).toLocaleString('en-US') + ' kW'; }

  /* ── what the session knows ───────────────────────────────────────── */
  /* The number in a typed field: '500 kVA' is 500, '1,200A' is 1200. */
  function figure(v) {
    if (v == null || v === '') return null;
    var n = Number(String(v).replace(/[^0-9.\-]/g, ''));
    return isFinite(n) && n > 0 ? n : null;
  }
  /* The intake's voltage select saves '120/208', '277/480' or '4160'. */
  function intakeVolts(v) {
    var t = String(v == null ? '' : v);
    if (/4160/.test(t)) return 4160;
    if (/480/.test(t)) return 480;
    if (/208/.test(t)) return 208;
    if (/240/.test(t)) return 240;
    if (/600/.test(t)) return 600;
    return figure(t);
  }

  function intake(pid) {
    /* The Viability Workflow's answers, read without creating a store. */
    try {
      var raw = root.localStorage && root.localStorage.getItem('omega.vw.' + (pid || '__unsaved__'));
      if (!raw) return null;
      var w = JSON.parse(raw);
      var sc = w && w.scenarios && w.scenarios[w.activeId];
      return (sc && sc.data) || null;
    } catch (e) { return null; }
  }

  function sitePoint() {
    var S = S_(), p = null;
    try { var ll = typeof root._npxSiteLatLon === 'function' ? root._npxSiteLatLon() : null;
      if (ll && isFinite(+ll.lat)) p = { lat: +ll.lat, lng: +(ll.lon != null ? ll.lon : ll.lng) }; } catch (e) {}
    if (!p) { try { var g = typeof root.omegaGeo === 'function' ? root.omegaGeo() : null;
      if (g && isFinite(+g.lat) && isFinite(+g.lng)) p = { lat: +g.lat, lng: +g.lng }; } catch (e) {} }
    if (!p && isFinite(+S.lat) && isFinite(+S.lng) && +S.lat !== 0) p = { lat: +S.lat, lng: +S.lng };
    return p;
  }

  function collect() {
    var S = S_(), pid = root._projectId || null, f = { projectId: pid };
    var vw = intake(pid) || {};
    var pt = sitePoint();
    var D = root._SITE_DATA || {};
    f.site = { name: val('pname') || null, address: val('addr-in') || val('omega-addr-in') || '',
               lat: pt ? pt.lat : null, lng: pt ? pt.lng : null };

    /* The drawing. Omega-Core skids are counted as themselves. */
    var d = { units: 0, chargers: {}, dcLoadKw: 0, service: null, xfmrKva: null, buildingKw: null };
    (S.shapes || []).forEach(function (sh) { if (sh && sh.kind === 'derdc' && sh.omegaCore) d.units++; });
    try { if (typeof root.evChargerTotals === 'function') {
      var ev = root.evChargerTotals() || {};
      d.chargers = { dcfcKw: num(ev.dcfcKw) || 0, dcfcUnits: num(ev.dcfcUnits) || 0, l2Kw: num(ev.l2Kw) || 0,
                     l2Units: num(ev.l2Units) || 0, ports: num(ev.ports) || 0 };
    } } catch (e) {}
    try { if (typeof root.omegaDcLoadKw === 'function') d.dcLoadKw = num(root.omegaDcLoadKw()) || 0; } catch (e) {}
    /* amps and volts as a PAIR from one source: BESS Config's when its amps
       are set, else the intake's — never intake amps on a default voltage */
    var cfgAmps = figure(val('bm-service-amps'));
    var amps = cfgAmps ? cfgAmps : figure(vw.p0_service_amps);
    var volts = cfgAmps ? figure(val('bm-service-volts')) : intakeVolts(vw.p0_service_v);
    if (amps && volts) d.service = { amps: amps, volts: volts, phases: 3,
                                     source: cfgAmps ? 'BESS Config service' : 'site intake' };
    d.xfmrKva = figure(vw.p0_xfmr_kva);
    try { var acc = typeof root._btmServiceAcceptance === 'function' ? root._btmServiceAcceptance() : null;
      if (acc && acc.hasLoad && num(acc.peakKW)) d.buildingKw = num(acc.peakKW); } catch (e) {}
    if (d.buildingKw == null && num(vw.p0_peak_kw)) d.buildingKw = num(vw.p0_peak_kw);
    f.drawing = d;

    /* The Run, and the cost sheet's own totals beside it (the ROM-grade
       benchmark lines). Read, never recomputed. */
    var r = S.costRollup || null;
    var W = root;
    if (r) f.run = { capex: num(r.capex), netCost: num(r.netCost), incentive: num(r.incentive),
                     annualRevenue: num(r.annualRevenue), at: iso(r.at),
                     stale: !!S.resultsStale, contracted: !!r.contracted,
                     low: num(W._COST_LOW), high: num(W._COST_HIGH),
                     lines: { ev: num(W._EV_TOTAL), bess: num(W._BESS_TOTAL), solar: num(W._SOLAR_TOTAL),
                              siteEquipment: num(W._SITE_EQ_TOTAL), conduit: num(W._CONDUIT_TOTAL),
                              indirect: num(W._INDIRECT_TOTAL), dcRom: num(W._DC_TOTAL), contingency: num(W._CONT_TOTAL) } };
    else f.run = null;

    /* Fiber already found on this project (the Network Proximity panel). */
    var of = S.omegaFiber || null;
    f.fiberOnFile = of ? { nearestRoute: of.nearestRoute || null, serviceability: of.serviceability || null,
                           routeDiversity: of.routeDiversity == null ? null : of.routeDiversity, at: S.omegaFiberAt || null } : null;
    /* Zoning and owner the parcel lookup already wrote, to prefill. */
    f.parcelZoning = D.parcelZoning || null;
    f.saved = S.omegaCore && S.omegaCore.rep ? S.omegaCore.rep : null;
    return f;
  }

  /* ── talking to the server ────────────────────────────────────────── */
  function token() {
    var u = null;
    try { u = root._currentUser || (root.firebase && root.firebase.auth && root.firebase.auth().currentUser); } catch (e) { u = null; }
    if (!u || typeof u.getIdToken !== 'function') return Promise.reject(new Error('Sign in to qualify a site for Omega-Core.'));
    try { return Promise.resolve(u.getIdToken()); } catch (e) { return Promise.reject(new Error('Sign in to qualify a site for Omega-Core.')); }
  }
  function post(body) {
    return token().then(function (tok) {
      return fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok }, body: JSON.stringify(body) });
    }).then(function (r) {
      return r.text().then(function (t) {
        var j = null; try { j = JSON.parse(t); } catch (e) {}
        if (!r.ok) { var err = new Error((j && j.error) || ('HTTP ' + r.status)); err.status = r.status; throw err; }
        return j || {};
      });
    });
  }

  /* ── the dialog ───────────────────────────────────────────────────── */
  function host() {
    var h = document.getElementById(HOST_ID);
    if (!h) {
      h = document.createElement('div'); h.id = HOST_ID;
      h.setAttribute('style', 'position:fixed;inset:0;background:rgba(6,12,22,.82);z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px');
      var downOnBackdrop = false;
      h.onmousedown = function (e) { downOnBackdrop = e.target === h; };
      h.onclick = function (e) { if (e.target === h && downOnBackdrop) close(); downOnBackdrop = false; };
      document.body.appendChild(h);
    }
    return h;
  }
  function close() {
    var h = document.getElementById(HOST_ID); if (h) h.remove();
    st.gen++; st.busy = false;
  }
  var INP = 'width:100%;box-sizing:border-box;background:var(--navy);border:1px solid var(--border);color:var(--text);border-radius:5px;padding:6px 8px;font-size:11.5px;font-family:inherit';
  function lbl(t) { return '<div style="font-size:9.5px;color:#64748B;text-transform:uppercase;letter-spacing:.4px;margin:0 0 3px">' + t + '</div>'; }
  function inp(id, value, ph, type) { return '<input id="' + id + '"' + (type ? ' type="' + type + '"' : '') + ' value="' + esc(value == null ? '' : value) + '" placeholder="' + esc(ph || '') + '" style="' + INP + '" oninput="OmegaCoreQualify.touched(this.id)">'; }
  function sel(id, value, opts) {
    return '<select id="' + id + '" style="' + INP + '" onchange="OmegaCoreQualify.touched(this.id)">' + opts.map(function (o) {
      return '<option value="' + esc(o[0]) + '"' + (String(value) === String(o[0]) ? ' selected' : '') + '>' + esc(o[1]) + '</option>';
    }).join('') + '</select>';
  }
  function field(label, html, w) { return '<div style="flex:' + (w || '1 1 150px') + ';min-width:0">' + lbl(label) + html + '</div>'; }
  function section(t) { return '<div style="font-size:10px;font-weight:800;color:#64748B;letter-spacing:.5px;margin:16px 0 8px">' + esc(t).toUpperCase() + '</div>'; }
  /* The words are the server's: a firm answer only on a confirmed fact,
     everything else "needs further qualification" (Tommy, 2026-10-02). */
  var QUAL = { clears: ['#22C55E', 'Clears'], 'clears-with-conditions': ['#38BDF8', 'Clears with conditions'],
               'needs-qualification': ['#F59E0B', 'Needs qualification'], 'likely-fails': ['#FB923C', 'Unlikely — confirm'],
               fails: ['#EF4444', 'Does not qualify'] };
  var VERDICT = { qualified: ['#22C55E', 'Qualified'], conditional: ['#38BDF8', 'Qualified with conditions'],
                  'needs-qualification': ['#F59E0B', 'Needs further qualification'], 'not-qualified': ['#EF4444', 'Does not qualify'] };
  function chip(c, t) { return '<span style="display:inline-block;padding:2px 8px;border-radius:999px;font-size:10px;font-weight:800;color:' + c + ';border:1px solid ' + c + ';background:rgba(255,255,255,.03)">' + esc(t) + '</span>'; }

  function header() {
    return '<div style="padding:16px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;gap:12px">'
      + '<div><div style="font-size:16px;font-weight:800;color:var(--text)">◆ Omega-Core — qualify this charging site</div>'
      + '<div style="font-size:10.5px;color:#64748B;margin-top:2px">Solela Edge Compute 75 kW + CleanCell R60 61.44 kWh / 60 kW on one 28 × 7.25 ft skid · its own utility meter · land lease to the host · 5-year minimum</div></div>'
      + '<button onclick="OmegaCoreQualify.close()" aria-label="Close" style="background:none;border:none;color:#64748B;font-size:20px;cursor:pointer;line-height:1">×</button></div>';
  }

  function factsHtml(f) {
    var d = f.drawing || {}, ch = d.chargers || {}, r = f.run;
    var rows = [];
    rows.push(['Site', esc(f.site.address || f.site.name || 'no address') + (f.site.lat != null ? ' <span style="color:#64748B">(' + f.site.lat.toFixed(5) + ', ' + f.site.lng.toFixed(5) + ')</span>' : ' <span style="color:#F59E0B">— no map point</span>')]);
    rows.push(['Omega-Core on the drawing', d.units ? d.units + ' skid' + (d.units > 1 ? 's' : '') : '<span style="color:#F59E0B">none placed — Draw › Data Ctr › Omega-Core Skid</span>']);
    rows.push(['Chargers on the drawing', (ch.dcfcUnits || ch.l2Units) ? (ch.dcfcUnits ? ch.dcfcUnits + ' DC fast (' + kw(ch.dcfcKw) + ')' : '') + (ch.dcfcUnits && ch.l2Units ? ' · ' : '') + (ch.l2Units ? ch.l2Units + ' Level 2 (' + kw(ch.l2Kw) + ')' : '') : '<span style="color:#F59E0B">none</span>']);
    rows.push(['Host service', d.service ? d.service.amps + ' A @ ' + d.service.volts + ' V <span style="color:#64748B">(' + esc(d.service.source) + ')</span>' : '<span style="color:#64748B">not on the project</span>']);
    rows.push(['Utility transformer', d.xfmrKva ? d.xfmrKva.toLocaleString('en-US') + ' kVA <span style="color:#64748B">(site intake)</span>' : '<span style="color:#64748B">not on the project</span>']);
    if (r) {
      rows.push(['The Run', 'Capex ' + money(r.capex) + (r.incentive ? ' · incentives ' + money(r.incentive) : '') + ' · year-1 revenue ' + money(r.annualRevenue)
        + (r.low != null && r.high != null && r.high > r.low ? ' <span style="color:#64748B">(range ' + money(r.low) + '–' + money(r.high) + ')</span>' : '')
        + (r.stale ? ' <span style="color:#F59E0B">— the drawing changed since</span>' : '')]);
      var L = r.lines || {}, parts = [];
      [['ev', 'EV'], ['bess', 'BESS'], ['solar', 'Solar'], ['siteEquipment', 'Site equipment'], ['conduit', 'Conduit'], ['indirect', 'Indirect'], ['dcRom', 'DC electrical ROM'], ['contingency', 'Contingency']].forEach(function (p) {
        if (L[p[0]] > 0) parts.push(p[1] + ' ' + money(L[p[0]]));
      });
      if (parts.length) rows.push(['Run cost lines', '<span style="color:var(--sub)">' + parts.join(' · ') + '</span>']);
    } else {
      rows.push(['The Run', '<span style="color:#F59E0B">not run in this session</span> <button onclick="OmegaCoreQualify.runSite()" style="margin-left:6px;padding:2px 9px;border-radius:6px;border:1px solid rgba(56,189,248,.5);background:rgba(56,189,248,.12);color:#BAE6FD;font-size:10.5px;cursor:pointer;font-family:inherit">Run the site</button>']);
    }
    if (f.fiberOnFile && f.fiberOnFile.nearestRoute && f.fiberOnFile.nearestRoute.distanceM != null)
      rows.push(['Fiber on file', 'nearest published route ' + (f.fiberOnFile.nearestRoute.distanceM / 1609.344).toFixed(2) + ' mi']);
    return '<table style="width:100%;border-collapse:collapse;font-size:11px">' + rows.map(function (rw) {
      return '<tr><td style="padding:3px 10px 3px 0;color:#64748B;white-space:nowrap;vertical-align:top">' + rw[0] + '</td><td style="padding:3px 0;color:var(--text)">' + rw[1] + '</td></tr>';
    }).join('') + '</table>';
  }

  function repHtml(f) {
    var s = f.saved || {};
    var dflt = function (k, v) { return s[k] != null && s[k] !== '' ? s[k] : v; };
    return section('What the rep knows — answers beat data')
      + '<div style="display:flex;gap:10px;flex-wrap:wrap">'
      + field('Skids to offer', inp('oc-units', dflt('units', (f.drawing.units || 1)), '1', 'number'), '0 1 110px')
      + field('Utility: kW available for a new 480 V service', inp('oc-availableKw', dflt('availableKw', ''), 'from the utility', 'number'))
      + field('Will-serve for the new meter', sel('oc-willServe', dflt('willServe', 'unknown'), [['unknown', 'Not asked'], ['requested', 'Requested, pending'], ['confirmed', 'Confirmed'], ['none', 'Declined']]))
      + '</div><div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:8px">'
      + field('Fiber on site today', sel('oc-fiberOnSite', dflt('fiberOnSite', 'unknown'), [['unknown', 'Unknown'], ['yes', 'Yes'], ['no', 'No']]), '0 1 130px')
      + field('Down Mbps', inp('oc-fiberDownMbps', dflt('fiberDownMbps', ''), '1000', 'number'), '0 1 100px')
      + field('Up Mbps', inp('oc-fiberUpMbps', dflt('fiberUpMbps', ''), '1000', 'number'), '0 1 100px')
      + field('Zoning code', inp('oc-zoningCode', dflt('zoningCode', f.parcelZoning || ''), 'blank = county record'), '0 1 150px')
      + '</div><div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:8px">'
      + field('Host will sign a land lease', sel('oc-hostWilling', dflt('hostWilling', 'unknown'), [['unknown', 'Not asked'], ['exploring', 'Exploring'], ['yes', 'Yes'], ['no', 'No']]))
      + field('Term (years, 5 minimum)', inp('oc-termYears', dflt('termYears', 5), '5', 'number'), '0 1 140px')
      + field('At the end of the term', sel('oc-endOfTerm', dflt('endOfTerm', 'undecided'), [['undecided', 'Undecided'], ['remove', 'Remove the skid, meter off'], ['buyout', 'Host buys at fair market value']]))
      + '</div><div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:8px">'
      + field('Rent per skid per month ($)', inp('oc-leaseMonthly', dflt('leaseMonthly', ''), 'blank = reference', 'number'), '0 1 190px')
      + field('Rent escalator (%/yr)', inp('oc-leaseEscalatorPct', dflt('leaseEscalatorPct', ''), 'blank = 2.5', 'number'), '0 1 140px')
      + '<div style="flex:1 1 220px;min-width:0;align-self:flex-end;font-size:10px;color:#64748B;line-height:1.5">No Omega-Core rent is set yet. '
      + 'Leave it blank for the market reference; type the rent agreed for this site and the lease and the host\'s figures follow it.</div>'
      + '</div>' + computeInputsHtml(f);
  }

  /* The compute model's inputs. Blank is the server's default; the figure
     the server used is shown as the placeholder once it has answered. The
     chipset list and the pricing bases are the server's too. */
  function computeInputsHtml(f) {
    var s = (f.saved && f.saved.compute) || {};
    var c = st.result && st.result.compute, eff = (c && c.inputs) || {};
    var dflt = function (k, v) { return s[k] != null && s[k] !== '' ? s[k] : v; };
    var ph = function (v, d) { return v != null ? String(v) : d; };
    var chips = (c && c.chipsets) ? c.chipsets.map(function (x) { return [x.key, x.name]; }) : [['h100', 'NVIDIA HGX H100 (default)']];
    var bases = (c && c.bases) ? c.bases.map(function (x) { return [x.key, x.label]; }) : [['spot', 'Spot'], ['on-demand', 'On-demand'], ['inference', 'Inference (per GPU)'], ['custom', 'Custom $/GPU-hour']];
    var capexSel = s.capexBasis ? (s.capexBasis === 'cmdc' ? 'cmdc:' + (s.capexConfig || 'general-air') + ':' + (s.capexCase || 'high')
                 : s.capexBasis === 'dynamic' ? 'dynamic:' + (s.capexCase || 'mid') : s.capexBasis) : 'skid';
    var opt = c && c.capex && c.capex.options;
    var lab = function (t, v) { return t + (v != null ? ' — ' + money(v) : ''); };
    var capexOpts = [
      ['cmdc:general-air:low', lab('75 kW container, air-cooled, low', opt && opt.cmdc.config === 'general-air' ? opt.cmdc.low : null)],
      ['cmdc:general-air:mid', lab('75 kW container, air-cooled, mid', opt && opt.cmdc.config === 'general-air' ? opt.cmdc.mid : null)],
      ['cmdc:general-air:high', lab('75 kW container, air-cooled, high', opt && opt.cmdc.config === 'general-air' ? opt.cmdc.high : null)],
      ['cmdc:accelerated-liquid:low', lab('75 kW container, liquid-cooled accelerated, low', opt && opt.cmdc.config === 'accelerated-liquid' ? opt.cmdc.low : null)],
      ['cmdc:accelerated-liquid:mid', lab('75 kW container, liquid-cooled accelerated, mid', opt && opt.cmdc.config === 'accelerated-liquid' ? opt.cmdc.mid : null)],
      ['cmdc:accelerated-liquid:high', lab('75 kW container, liquid-cooled accelerated, high', opt && opt.cmdc.config === 'accelerated-liquid' ? opt.cmdc.high : null)],
      ['dynamic:low', lab('Scaled to the chipset, low', opt ? opt.dynamic.low : null)],
      ['dynamic:mid', lab('Scaled to the chipset, mid', opt ? opt.dynamic.mid : null)],
      ['dynamic:high', lab('Scaled to the chipset, high', opt ? opt.dynamic.high : null)],
      ['skid', lab('Omega-Core skid price as recorded', opt ? opt.skid : null)],
      ['custom', 'Type a figure']
    ];
    var dbt = eff.debt || {};
    return section('Omega Core Skid — compute model inputs (blank = default)')
      + '<div style="display:flex;gap:10px;flex-wrap:wrap">'
      + field('Chipset', sel('occ-chipset', dflt('chipset', eff.chipset || 'h100'), chips), '1 1 220px')
      + field('Pricing basis', sel('occ-pricingBasis', dflt('pricingBasis', eff.pricingBasis || 'spot'), bases), '0 1 160px')
      + field('Custom $/GPU-hour', inp('occ-customGpuHour', dflt('customGpuHour', ''), 'with Custom', 'number'), '0 1 120px')
      + field('Utilization (%)', inp('occ-utilization', dflt('utilization', ''), ph(eff.utilization != null ? Math.round(eff.utilization * 100) : null, 'default'), 'number'), '0 1 110px')
      + field('Electricity ($/kWh)', inp('occ-electricity', dflt('electricity', ''), ph(eff.electricity, 'default'), 'number'), '0 1 120px')
      + '</div><div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:8px">'
      + field('Capital cost basis', sel('occ-capex', capexSel, capexOpts), '1 1 300px')
      + field('Custom CAPEX ($)', inp('occ-capexCustom', dflt('capexCustom', ''), 'with Type a figure', 'number'), '0 1 140px')
      + field('Debt (% of cost)', inp('occ-ltc', dflt('ltc', ''), ph(dbt.ltc != null ? Math.round(dbt.ltc * 100) : null, 'default'), 'number'), '0 1 110px')
      + field('Debt rate (%)', inp('occ-rate', dflt('rate', ''), ph(dbt.rate != null ? Math.round(dbt.rate * 1000) / 10 : null, 'default'), 'number'), '0 1 100px')
      + field('Host\'s rent as a cost', sel('occ-includeLease', dflt('includeLease', 'yes'), [['yes', 'Yes — in the cash flow'], ['no', 'No — the skid alone']]), '0 1 170px')
      + '</div>';
  }

  /* An answer is what the rep typed or chose, now or on an earlier visit.
     A prefill (the skids on the drawing, the parcel's zoning) is not: left
     untouched it is not sent, so the drawing and the county record keep
     deciding when they change. Null when the dialog is gone. */
  function readRep() {
    if (!document.getElementById(HOST_ID)) return null;
    var saved = (st.facts && st.facts.saved) || {}, r = {};
    function answered(id, key) { return !!st.dirty[id] || saved[key] != null; }
    var u = num(val('oc-units')); if (u != null && answered('oc-units', 'units')) r.units = u;
    var a = num(val('oc-availableKw')); if (a != null) r.availableKw = a;
    r.willServe = val('oc-willServe') || 'unknown';
    r.fiberOnSite = val('oc-fiberOnSite') || 'unknown';
    var dn = num(val('oc-fiberDownMbps')); if (dn != null) r.fiberDownMbps = dn;
    var up = num(val('oc-fiberUpMbps')); if (up != null) r.fiberUpMbps = up;
    if (val('oc-zoningCode') && answered('oc-zoningCode', 'zoningCode')) r.zoningCode = val('oc-zoningCode');
    r.hostWilling = val('oc-hostWilling') || 'unknown';
    var t = num(val('oc-termYears')); if (t != null) r.termYears = t;
    r.endOfTerm = val('oc-endOfTerm') || 'undecided';
    var lm = num(val('oc-leaseMonthly')); if (lm != null) r.leaseMonthly = lm;
    var le = num(val('oc-leaseEscalatorPct')); if (le != null) r.leaseEscalatorPct = le;
    var c = readCompute(saved.compute || {}); if (c) r.compute = c;
    return r;
  }
  /* The compute inputs the rep set: a choice made now or on an earlier
     visit, or a figure typed. Nothing else is sent, so the server's defaults
     keep deciding. Null when none. */
  function readCompute(saved) {
    var c = {}, any = false;
    function chosen(id, key) { return !!st.dirty[id] || saved[key] != null; }
    if (chosen('occ-chipset', 'chipset') && val('occ-chipset')) { c.chipset = val('occ-chipset'); any = true; }
    if (chosen('occ-pricingBasis', 'pricingBasis') && val('occ-pricingBasis')) { c.pricingBasis = val('occ-pricingBasis'); any = true; }
    var cg = num(val('occ-customGpuHour')); if (cg != null) { c.customGpuHour = cg; any = true; }
    var u = num(val('occ-utilization')); if (u != null) { c.utilization = u; any = true; }
    var e = num(val('occ-electricity')); if (e != null) { c.electricity = e; any = true; }
    if (chosen('occ-capex', 'capexBasis') && val('occ-capex')) {
      var parts = val('occ-capex').split(':');
      c.capexBasis = parts[0];
      if (parts[0] === 'cmdc') { c.capexConfig = parts[1]; c.capexCase = parts[2]; }
      else if (parts[0] === 'dynamic') c.capexCase = parts[1];
      any = true;
    }
    var cc = num(val('occ-capexCustom')); if (cc != null) { c.capexCustom = cc; any = true; }
    var ltc = num(val('occ-ltc')), rate = num(val('occ-rate'));
    if (ltc != null) { c.ltc = ltc; any = true; }
    if (rate != null) { c.rate = rate; any = true; }
    if (ltc != null || rate != null) { c.debt = {}; if (ltc != null) c.debt.ltc = ltc; if (rate != null) c.debt.rate = rate; }
    if (chosen('occ-includeLease', 'includeLease') && val('occ-includeLease')) { c.includeLease = val('occ-includeLease') === 'yes' ? 'yes' : 'no'; any = true; }
    return any ? c : null;
  }

  function sourcesHtml() {
    var names = { geocode: 'Location', grid: 'Grid Atlas', fiber: 'Network Proximity (fiber)', parcel: 'Parcel', score: 'Omega-Core gates' };
    var col = { ok: '#22C55E', warn: '#F59E0B', bad: '#EF4444', busy: '#38BDF8' };
    var keys = Object.keys(st.sources);
    if (!keys.length) return '';
    return '<div style="font-size:10.5px;line-height:1.75;margin-top:8px">' + keys.map(function (k) {
      var s = st.sources[k];
      return '<div><span style="color:' + (col[s.state] || '#94A3B8') + '">●</span> <strong style="color:var(--text)">' + esc(names[k] || k) + '</strong> <span style="color:var(--sub)">' + esc(s.text || '') + '</span></div>';
    }).join('') + '</div>';
  }

  function gateHtml(g) {
    var s = QUAL[g.qualification] || ['#94A3B8', g.qualification || g.status];
    return '<div style="border:1px solid var(--border);border-radius:9px;padding:10px 12px;margin-bottom:8px;background:var(--navy)">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><div style="font-weight:800;color:var(--text);font-size:12.5px">' + esc(g.label)
      + (g.hardGate ? ' <span style="font-size:9.5px;color:#64748B;font-weight:600">· hard gate</span>' : '') + '</div>' + chip(s[0], s[1]) + '</div>'
      + '<div style="font-size:11.5px;color:var(--text);margin:4px 0 4px">' + esc(g.headline || '') + '</div>'
      + '<ul style="margin:0;padding-left:16px;font-size:10.5px;color:var(--sub);line-height:1.6">' + (g.basis || []).map(function (b) { return '<li>' + esc(b) + '</li>'; }).join('') + '</ul>'
      + (g.measured ? '<div style="font-size:9.5px;color:#64748B;margin-top:4px">' + esc(g.measured) + '</div>' : '')
      + '</div>';
  }

  function paybackText(hs) {
    var hasRev = hs.run && hs.run.annualRevenue > 0;
    var after = hs.paybackYearsAfter != null ? hs.paybackYearsAfter + ' yr' : 'not inside the term';
    if (!hasRev) return hs.paybackYearsAfter != null ? hs.paybackYearsAfter + ' yr on the lease alone' : '—';
    return (hs.paybackYearsBefore != null ? hs.paybackYearsBefore + ' yr' : '40+ yr') + ' → ' + (hs.paybackYearsAfter != null ? after : '40+ yr');
  }

  function resultHtml(r) {
    if (!r) return '';
    var v = VERDICT[r.verdict] || ['#94A3B8', r.verdictLabel || r.verdict];
    var h = '<div style="margin-top:14px;padding:12px 14px;border-radius:10px;border:1px solid ' + v[0] + ';background:rgba(255,255,255,.02)">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap"><div style="font-size:15px;font-weight:800;color:' + v[0] + '">' + esc(v[1]) + '</div>'
      + '<div style="font-size:11px;color:var(--sub)">' + esc(r.units.proposed) + ' skid' + (r.units.proposed > 1 ? 's' : '') + ' proposed'
      + (r.units.supported != null ? ' · power carries ' + esc(r.units.supported) : '') + '</div></div>'
      + '<div style="font-size:11px;color:var(--text);margin-top:4px;line-height:1.55">' + esc(r.verdictReason) + '</div></div>';

    h += section('The three gates');
    (r.gateOrder || []).forEach(function (k) { if (r.gates[k]) h += gateHtml(r.gates[k]); });

    var o = r.offer;
    if (o) {
      /* the heading is the server's: a market reference is never an offer */
      h += section(o.label || 'Land lease');
      var rows = [['Per skid, per month', o.monthlyPerSkid], ['Per month', o.monthly], ['Per year (year 1)', o.annual], ['Over the term, escalating ' + (o.source === 'entered' ? o.escalatorPct.base + '%' : ''), o.termTotal]];
      if (o.source === 'entered') {
        h += '<table style="width:100%;border-collapse:collapse;font-size:11.5px">' + rows.map(function (row) {
          return '<tr style="border-top:1px solid var(--border)"><td style="padding:5px 6px 5px 0;color:var(--sub)">' + row[0] + '</td><td style="text-align:right;padding:5px 6px;font-weight:800;color:var(--text)">' + money(row[1].base) + '</td></tr>';
        }).join('') + '</table>';
      } else {
        h += '<table style="width:100%;border-collapse:collapse;font-size:11.5px"><tr style="color:#64748B;font-size:10px;text-transform:uppercase"><td></td><td style="text-align:right;padding:3px 6px">Low</td><td style="text-align:right;padding:3px 6px;color:var(--text)">Base</td><td style="text-align:right;padding:3px 6px">High</td></tr>';
        rows.forEach(function (row) {
          h += '<tr style="border-top:1px solid var(--border)"><td style="padding:5px 6px 5px 0;color:var(--sub)">' + row[0] + '</td>'
            + '<td style="text-align:right;padding:5px 6px">' + money(row[1].low) + '</td><td style="text-align:right;padding:5px 6px;font-weight:800;color:var(--text)">' + money(row[1].base) + '</td><td style="text-align:right;padding:5px 6px">' + money(row[1].high) + '</td></tr>';
        });
        h += '</table>';
      }
      h += '<div style="font-size:10px;color:#64748B;margin-top:5px">' + esc(o.basis) + ' ' + esc(o.howToUse) + '</div>';
      if (o.market && o.market.sources) h += '<div style="font-size:10px;color:var(--sub);margin-top:6px;line-height:1.55">' + esc(o.market.note) + '<ul style="margin:3px 0 0;padding-left:16px">'
        + o.market.sources.map(function (x) {
          return '<li><strong style="color:var(--text)">' + esc(x.what) + '</strong> — ' + esc(x.figure)
            + (/^https:\/\//.test(x.url || '') ? ' <a href="' + esc(x.url) + '" target="_blank" rel="noopener" style="color:inherit;text-decoration:underline">source</a>' : '') + '</li>';
        }).join('') + '</ul></div>';
    } else {
      h += section('The host\'s land lease') + '<div style="font-size:11px;color:#FDE68A">No lease is quoted until '
        + (r.verdict === 'not-qualified' ? 'this is resolved — the site does not qualify on a confirmed fact.' : 'the open items below are confirmed.') + '</div>';
    }

    var hs = r.host || {}, run = hs.run || {};
    h += section('What it does to the charging site (from the Run)');
    if (o && run.capex != null) {
      var cells = [
        ['Site capex', money(run.capex)], ['Net of incentives', money(run.netCost)], ['Year-1 revenue', money(run.annualRevenue)],
        ['Lease, year 1', money(hs.leaseAnnual)], ['Revenue uplift', hs.revenueUpliftPct != null ? hs.revenueUpliftPct + '%' : '—'],
        ['Payback', paybackText(hs)],
        ['Lease over term', money(hs.leaseTermTotal)], ['Covers of net cost', hs.leaseCoversPctOfNet != null ? hs.leaseCoversPctOfNet + '%' : '—']
      ];
      h += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px">' + cells.map(function (c) {
        return '<div style="border:1px solid var(--border);border-radius:8px;padding:8px 10px;background:var(--navy)"><div style="font-size:9.5px;color:#64748B;text-transform:uppercase;letter-spacing:.3px">' + c[0] + '</div><div style="font-size:14px;font-weight:800;color:var(--text);margin-top:2px">' + c[1] + '</div></div>';
      }).join('') + '</div>';
    }
    (hs.notes || []).forEach(function (n) { h += '<div style="font-size:10.5px;color:var(--sub);margin-top:5px">' + esc(n) + '</div>'; });

    var p = r.program || {}, t = r.terms || {};
    h += section('The terms');
    h += '<ul style="margin:0;padding-left:16px;font-size:11px;color:var(--text);line-height:1.7">'
      + '<li><strong>' + esc(t.minTermYears) + '-year minimum</strong>' + (t.termYears && t.termYears !== t.minTermYears ? ' — priced on ' + esc(t.termYears) + ' years' : '') + '. ' + esc(t.renewal || '') + '</li>'
      + '<li>' + esc(t.meter || '') + '</li><li>' + esc(t.ownership || '') + '</li>'
      + '<li><strong>End of term:</strong> ' + esc((t.endOfTerm || {}).remove || '') + ' ' + esc((t.endOfTerm || {}).buyout || '') + '</li>'
      + '</ul>';
    if (p.systemCostPerSkid) {
      var fmv = p.fmvAtEndPerSkid || {};
      h += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:8px;margin-top:10px">'
        + '<div style="border:1px solid var(--border);border-radius:8px;padding:8px 10px;background:var(--navy)"><div style="font-size:9.5px;color:#64748B;text-transform:uppercase">System cost</div><div style="font-size:14px;font-weight:800;color:var(--text)">' + money(p.systemCostPerSkid) + ' <span style="font-size:10px;color:#64748B">per skid</span></div><div style="font-size:10px;color:var(--sub)">' + money(p.systemCost) + ' for ' + esc(r.units.proposed) + ' · ClearSky\'s, not the host\'s</div></div>'
        + '<div style="border:1px solid var(--border);border-radius:8px;padding:8px 10px;background:var(--navy)"><div style="font-size:9.5px;color:#64748B;text-transform:uppercase">Buyout at FMV, year ' + esc((t.endOfTerm || {}).year) + '</div><div style="font-size:14px;font-weight:800;color:var(--text)">' + money(fmv.low) + '–' + money(fmv.high) + '</div><div style="font-size:10px;color:var(--sub)">per skid, indicative · base ' + money(fmv.base) + '</div></div>'
        + (p.fiberLateral ? '<div style="border:1px solid var(--border);border-radius:8px;padding:8px 10px;background:var(--navy)"><div style="font-size:9.5px;color:#64748B;text-transform:uppercase">Fiber lateral (ClearSky)</div><div style="font-size:14px;font-weight:800;color:var(--text)">' + esc(p.fiberLateral.mi) + ' mi</div><div style="font-size:10px;color:var(--sub)">' + (p.fiberLateral.capexMid ? money(p.fiberLateral.capexMid) + ' at the midpoint' : 'on site') + '</div></div>' : '')
        + '</div><div style="font-size:10px;color:#64748B;margin-top:5px">' + esc(p.fmvNote || '') + '</div>';
    }

    if (r.asks && r.asks.length) {
      h += section(r.verdict === 'qualified' || r.verdict === 'conditional' ? 'Still to do' : 'What it needs to qualify');
      h += '<ol style="margin:0;padding-left:18px;font-size:11px;color:var(--text);line-height:1.65">' + r.asks.map(function (a) {
        return '<li><span style="color:#64748B">' + esc(a.gate) + ' ·</span> ' + esc(a.ask) + '</li>';
      }).join('') + '</ol>';
    }
    if (r.findings && r.findings.length) {
      h += '<div style="margin-top:10px">' + r.findings.map(function (fd) {
        return '<div style="font-size:10.5px;color:' + (fd.severity === 'risk' ? '#FDE68A' : 'var(--sub)') + ';margin-top:3px">' + (fd.severity === 'risk' ? '⚠ ' : '· ') + esc(fd.text) + '</div>';
      }).join('') + '</div>';
    }
    h += computeHtml(r.compute, r);
    h += '<div style="font-size:9.5px;color:#64748B;margin-top:12px;line-height:1.55">' + esc(r.disclaimer || '') + ' Lease card ' + esc(r.rateCardVersion || '') + '.</div>';
    return h;
  }

  /* ── the skid's compute economics, as the server returned them ──────── */
  function tile(l, v, sub) {
    return '<div style="border:1px solid var(--border);border-radius:8px;padding:8px 10px;background:var(--navy)"><div style="font-size:9.5px;color:#64748B;text-transform:uppercase;letter-spacing:.3px">' + esc(l) + '</div>'
      + '<div style="font-size:14px;font-weight:800;color:var(--text);margin-top:2px">' + v + '</div>' + (sub ? '<div style="font-size:10px;color:var(--sub)">' + sub + '</div>' : '') + '</div>';
  }
  function grid(cells, min) { return '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(' + (min || 150) + 'px,1fr));gap:8px">' + cells.join('') + '</div>'; }
  function pctTxt(v, d) { return v == null ? '—' : (Math.round(v * (d ? 10 : 1)) / (d ? 10 : 1)) + '%'; }
  function xTxt(v) { return v == null ? '—' : v.toFixed(2) + 'x'; }
  function moTxt(m) { return m == null ? 'beyond the term' : m + ' mo'; }
  function kTxt(v) { return v == null ? '—' : '$' + Math.round(v / 1000).toLocaleString('en-US') + 'k'; }
  var TH = 'text-align:right;padding:4px 6px;color:#64748B;font-size:10px;text-transform:uppercase;white-space:nowrap';
  var TD = 'text-align:right;padding:4px 6px;border-top:1px solid var(--border);white-space:nowrap';
  function computeHtml(c, r) {
    if (!c || !c.cashFlow) return '';
    var cf = c.cashFlow, rt = cf.returns, b = cf.bankability, cap = c.capacity, d = cf.debt;
    var n = c.units || 1;
    var h = section('Omega Core Skid — compute economics (' + esc(c.chipset.name) + ', ' + esc(cf.pricingBasisLabel) + ')');
    h += '<div style="font-size:11px;color:var(--text);margin-bottom:8px">' + esc(cap.nodes) + ' node' + (cap.nodes === 1 ? '' : 's') + ' · ' + esc(cap.gpus) + ' GPUs · ' + esc(cap.installedKw) + ' kW installed of ' + esc(c.inputs.itLoadKw) + ' kW IT · ' + esc(cap.facilityKw) + ' kW at the meter'
      + (cf.priced ? ' · $' + cf.realizedGpuHour.toFixed(2) + '/GPU-hr' : ' · <span style="color:#FDE68A">no public price on this basis</span>')
      + (n > 1 ? ' · <span style="color:var(--sub)">per skid, × ' + n + ' below</span>' : '') + '</div>';
    h += grid([
      tile('Capital cost', money(c.capex.amount), esc(c.capex.label) + ' · ' + money(c.capex.perItKw) + '/IT kW'),
      tile('Debt funded', money(d.funded), Math.round(d.ltc * 100) + '% of cost at ' + (Math.round(d.rate * 1000) / 10) + '%, ' + d.maturityMonths + ' mo'),
      tile('Initial equity', money(d.initialEquity), 'equity ' + money(d.equityCapex) + ' + fee ' + money(d.fee) + ' + reserve ' + money(d.reserve)),
      tile('Year-1 revenue', money(rt.year1Revenue), 'year-1 operating cash flow ' + money(rt.year1Ebitda)),
      tile('Payback', moTxt(rt.projectPaybackMonth) + ' project · ' + moTxt(rt.equityPaybackMonth) + ' equity'),
      tile('5-year multiples', xTxt(rt.projectCashMultiple) + ' project · ' + xTxt(rt.equityCashMultiple) + ' equity', 'IRR ' + pctTxt(rt.projectIrrPct, 1) + ' project · ' + pctTxt(rt.equityIrrPct, 1) + ' equity')
    ], 170);
    if (n > 1 && c.totals) h += '<div style="font-size:10.5px;color:var(--sub);margin-top:6px">For ' + n + ' skids: capital ' + money(c.totals.capex) + ' · debt ' + money(c.totals.debtFunded) + ' · initial equity ' + money(c.totals.initialEquity)
      + ' · year-1 revenue ' + money(c.totals.year1Revenue) + ' · year-1 operating cash flow ' + money(c.totals.year1Ebitda) + '</div>';

    /* bankability */
    var okc = b.minDscrAmortizing == null ? '#94A3B8' : b.meetsTarget ? '#22C55E' : '#EF4444';
    h += '<div style="margin-top:10px;padding:10px 12px;border-radius:9px;border:1px solid ' + okc + ';background:rgba(255,255,255,.02)">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap"><div style="font-weight:800;color:var(--text);font-size:12.5px">Bankability</div>'
      + chip(okc, b.minDscrAmortizing == null ? 'Unlevered' : b.meetsTarget ? 'Min DSCR ' + b.minDscrAmortizing.toFixed(2) + 'x ≥ ' + b.targetDscr.toFixed(2) + 'x' : 'Min DSCR ' + b.minDscrAmortizing.toFixed(2) + 'x < ' + b.targetDscr.toFixed(2) + 'x') + '</div>'
      + '<div style="font-size:11px;color:var(--text);margin-top:4px">' + esc(c.customer.bankability.verdict) + (b.monthsBelowTarget ? ' (' + b.monthsBelowTarget + ' of ' + b.amortizingMonths + ' months).' : '.')
      + (b.debtCapacityAtTarget != null ? ' At the ' + b.targetDscr.toFixed(2) + 'x target the cash flow carries up to ' + money(b.debtCapacityAtTarget) + ' of debt (' + Math.round(b.ltcAtTarget * 100) + '% of cost).' : '')
      + (b.balloonMonth ? ' Balloon ' + money(d.balloon) + ' in month ' + b.balloonMonth + (b.balloonMonthDscr != null ? ' (that month\'s cover ' + b.balloonMonthDscr.toFixed(2) + 'x from operations' + (rt.residualValue ? ', before the ' + money(rt.residualValue) + ' residual' : '') + ')' : '') + '.' : '')
      + (d.balanceAtTermEnd > 0 ? ' <span style="color:#FDE68A">' + money(d.balanceAtTermEnd) + ' of debt outstanding at the end of the term.</span>' : '') + '</div></div>';

    /* annual table */
    h += '<div style="overflow-x:auto;margin-top:10px"><table style="width:100%;border-collapse:collapse;font-size:11px"><tr><th style="' + TH + ';text-align:left">Year</th><th style="' + TH + '">Revenue</th><th style="' + TH + '">OpEx</th>'
      + (cf.lease.included ? '<th style="' + TH + '">of which rent</th>' : '') + '<th style="' + TH + '">Operating CF</th><th style="' + TH + '">Debt service</th><th style="' + TH + '">Equity CF</th><th style="' + TH + '">DSCR</th></tr>';
    cf.years.forEach(function (y) {
      h += '<tr><td style="' + TD + ';text-align:left">' + y.year + '</td><td style="' + TD + '">' + money(y.revenue) + '</td><td style="' + TD + '">' + money(y.opex) + '</td>'
        + (cf.lease.included ? '<td style="' + TD + '">' + money(y.lease) + '</td>' : '') + '<td style="' + TD + ';font-weight:800;color:var(--text)">' + money(y.ebitda) + '</td><td style="' + TD + '">' + money(y.debtService) + '</td>'
        + '<td style="' + TD + '">' + money(y.equity) + '</td><td style="' + TD + '">' + (y.dscr != null ? y.dscr.toFixed(2) + 'x' : '—') + '</td></tr>';
    });
    h += '</table></div><div style="font-size:10px;color:#64748B;margin-top:4px">Per skid. Equity cash flow in year 1 is after the equity, fee and reserve paid in month 1; year ' + cf.years.length + ' includes the ' + money(rt.residualValue) + ' residual and the balloon.</div>';

    /* every chipset */
    var sc = c.scenarios;
    if (sc && sc.rows) {
      h += '<details style="margin-top:10px"><summary style="cursor:pointer;font-size:11px;color:var(--text);font-weight:700">Every chipset in the same ' + esc(c.inputs.itLoadKw) + ' kW, unlevered</summary>'
        + '<div style="overflow-x:auto;margin-top:6px"><table style="width:100%;border-collapse:collapse;font-size:10.5px"><tr><th style="' + TH + ';text-align:left">Chipset</th><th style="' + TH + '">Nodes · GPUs</th><th style="' + TH + '">$/GPU-hr</th><th style="' + TH + '">Revenue / yr</th><th style="' + TH + '">Contribution</th><th style="' + TH + '">Margin</th><th style="' + TH + '">CAPEX mid</th><th style="' + TH + '">Payback</th><th style="' + TH + '">Yield</th></tr>';
      sc.rows.forEach(function (x) {
        var hi = x.key === sc.bestYield ? ';color:#86EFAC' : x.key === c.chipset.key ? ';color:var(--text);font-weight:700' : '';
        h += '<tr><td style="' + TD + ';text-align:left' + hi + '">' + esc(x.name) + (x.key === sc.bestYield ? ' ★' : '') + '</td><td style="' + TD + '">' + x.nodes + ' · ' + x.gpus + '</td>'
          + (x.priced ? '<td style="' + TD + '">$' + x.gpuHourPrice.toFixed(2) + '</td><td style="' + TD + '">' + money(x.annualRevenue) + '</td><td style="' + TD + '">' + money(x.contribution) + '</td><td style="' + TD + '">' + pctTxt(x.marginPct, 1) + '</td><td style="' + TD + '">' + money(x.capexMid) + '</td><td style="' + TD + '">' + (x.paybackMonths != null ? x.paybackMonths + ' mo' : '—') + '</td><td style="' + TD + '">' + pctTxt(x.cashOnCashYieldPct, 1) + '</td>'
            : '<td style="' + TD + ';text-align:left;color:#FDE68A" colspan="7">' + esc(x.note || 'no public price') + '</td>') + '</tr>';
      });
      h += '</table></div><div style="font-size:10px;color:#64748B;margin-top:4px">' + esc(sc.basis) + ' ★ best cash-on-cash yield.</div></details>';
    }
    /* sensitivity */
    var se = c.sensitivity;
    if (se && se.priced) {
      h += '<details style="margin-top:8px"><summary style="cursor:pointer;font-size:11px;color:var(--text);font-weight:700">Revenue sensitivity — utilisation × price realisation</summary>'
        + '<div style="overflow-x:auto;margin-top:6px"><table style="width:100%;border-collapse:collapse;font-size:10.5px"><tr><th style="' + TH + ';text-align:left">Price ↓ / Util →</th>' + se.utilization.map(function (u) { return '<th style="' + TH + '">' + Math.round(u * 100) + '%</th>'; }).join('') + '</tr>';
      se.priceRealization.forEach(function (pr, i) {
        h += '<tr><td style="' + TD + ';text-align:left;color:#64748B">' + Math.round(pr * 100) + '%</td>' + se.annualRevenue[i].map(function (v, j) {
          var base = Math.abs(pr - 1) < 1e-9 && Math.abs(se.utilization[j] - c.inputs.utilization) < 1e-9;
          return '<td style="' + TD + (base ? ';font-weight:800;color:var(--text)' : '') + '">' + kTxt(v) + '</td>';
        }).join('') + '</tr>';
      });
      h += '</table></div><div style="font-size:10px;color:#64748B;margin-top:4px">' + esc(se.basis) + '</div></details>';
    }
    /* the build-up, where the server disclosed it */
    if (c.disclosed && c.buildUp) {
      var bu = c.buildUp, cfgKey = c.inputs.capexConfig === 'accelerated-liquid' ? 'acc' : 'gp';
      h += '<details style="margin-top:8px"><summary style="cursor:pointer;font-size:11px;color:#FDE68A;font-weight:700">Staff only — how the costs are built</summary>'
        + '<div style="font-size:10.5px;color:var(--sub);margin-top:6px">' + esc(bu.sources.capex.what) + '. Chipset-scaled rows use the accelerated endpoints: compute × GPUs ÷ 48 × $/GPU index (' + esc(bu.chipsetLibrary.filter(function (x) { return x.key === c.chipset.key; })[0].indexBasis) + ').</div>'
        + '<div style="overflow-x:auto;margin-top:6px"><table style="width:100%;border-collapse:collapse;font-size:10.5px"><tr><th style="' + TH + ';text-align:left">Category</th><th style="' + TH + '">' + (cfgKey === 'acc' ? 'Accelerated' : 'General purpose') + ' low</th><th style="' + TH + '">high</th><th style="' + TH + '">Scaled low</th><th style="' + TH + '">Scaled mid</th><th style="' + TH + '">Scaled high</th><th style="' + TH + '">Factor</th></tr>';
      bu.cmdc.categories.forEach(function (cat, i) {
        var dr = bu.dynamicCapex.rows[i];
        h += '<tr><td style="' + TD + ';text-align:left">' + esc(cat.label) + '</td><td style="' + TD + '">' + money(cat[cfgKey][0]) + '</td><td style="' + TD + '">' + money(cat[cfgKey][1]) + '</td><td style="' + TD + '">' + money(dr.low) + '</td><td style="' + TD + '">' + money(dr.mid) + '</td><td style="' + TD + '">' + money(dr.high) + '</td><td style="' + TD + '">' + dr.factor + '×</td></tr>';
      });
      h += '</table></div><div style="font-size:10px;color:#64748B;margin-top:6px">Pricing: ' + esc(bu.sources.pricing.what) + ', ' + esc(bu.sources.pricing.asOf) + '. Corrections to the workbook: ' + bu.corrections.map(esc).join(' ') + '</div></details>';
    }
    (c.notes || []).forEach(function (t) { h += '<div style="font-size:10.5px;color:var(--sub);margin-top:5px">· ' + esc(t) + '</div>'; });
    h += '<div style="font-size:9.5px;color:#64748B;margin-top:6px;line-height:1.55">' + esc(c.disclaimer || '') + '</div>';
    return h;
  }

  function paint() {
    var f = st.facts; if (!f) return;
    var body = '<div style="padding:14px 20px">' + factsHtml(f) + repHtml(f)
      + '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px">'
      + '<button id="oc-screen" onclick="OmegaCoreQualify.screen()"' + (st.busy ? ' disabled' : '') + ' style="flex:1 1 200px;padding:10px;border-radius:8px;cursor:pointer;font-family:inherit;font-weight:700;font-size:12px;background:rgba(34,211,238,.14);border:1px solid rgba(34,211,238,.5);color:#A5F3FC">' + (st.evidence ? 'Re-run the lookups' : 'Screen the site') + ' — power, location, fiber</button>'
      + '<button id="oc-rescore" onclick="OmegaCoreQualify.rescore()"' + (st.busy ? ' disabled' : '') + ' style="flex:1 1 160px;padding:10px;border-radius:8px;cursor:pointer;font-family:inherit;font-weight:700;font-size:12px;background:rgba(74,222,128,.12);border:1px solid rgba(74,222,128,.45);color:#86EFAC">Qualify with these answers</button>'
      + (st.result ? '<button onclick="OmegaCoreQualify.print(\'customer\')" style="flex:0 1 170px;padding:10px;border-radius:8px;cursor:pointer;font-family:inherit;font-weight:700;font-size:12px;background:rgba(148,163,184,.12);border:1px solid rgba(148,163,184,.4);color:var(--text)">Print customer version</button>'
        + '<button onclick="OmegaCoreQualify.print(\'full\')" style="flex:0 1 130px;padding:10px;border-radius:8px;cursor:pointer;font-family:inherit;font-weight:700;font-size:12px;background:rgba(148,163,184,.12);border:1px solid rgba(148,163,184,.4);color:var(--text)">Print full report</button>' : '')
      + '</div>' + '<div id="oc-sources">' + sourcesHtml() + '</div>'
      + '<div id="oc-log" style="margin-top:8px;font-size:11px;color:var(--sub)"></div>'
      + '<div id="oc-result">' + resultHtml(st.result) + '</div></div>';
    host().innerHTML = '<div style="background:var(--panel);border:1px solid var(--border);border-radius:12px;max-width:860px;width:100%;max-height:92vh;overflow:auto;box-shadow:0 20px 60px rgba(0,0,0,.6);color:var(--text)">' + header() + body + '</div>';
  }
  function log(html, color) { var e = document.getElementById('oc-log'); if (e) e.innerHTML = '<span style="color:' + (color || 'var(--sub)') + '">' + html + '</span>'; }
  function busy(on) {
    st.busy = !!on;
    ['oc-screen', 'oc-rescore'].forEach(function (id) { var b = document.getElementById(id); if (b) { b.disabled = !!on; b.style.opacity = on ? '.55' : ''; } });
  }
  function onSource(key, state, text) {
    st.sources[key] = { state: state, text: text };
    var e = document.getElementById('oc-sources'); if (e) e.innerHTML = sourcesHtml();
  }

  function siteKey(f) { return f.site.lat != null ? f.site.lat.toFixed(5) + ',' + f.site.lng.toFixed(5) : 'addr:' + (f.site.address || ''); }

  /* Score against what is gathered — no lookup re-runs. */
  function rescore() {
    if (st.busy) return Promise.resolve(null);
    var f = st.facts; if (!f) return Promise.resolve(null);
    var rep = readRep(); if (!rep) return Promise.resolve(null);
    var gen = st.gen, pid = root._projectId || null;
    var ev = st.evidence && st.evidenceKey === siteKey(f) ? st.evidence : {};
    var evidence = { gridAtlas: ev.gridAtlas || null, network: ev.network || null, parcel: ev.parcel || null,
                     site: ev.site ? { lat: ev.site.lat, lng: ev.site.lng } : null, fiberOnFile: f.fiberOnFile };
    var site = { name: f.site.name, address: f.site.address || (ev.site && (ev.site.resolved || ev.site.address)) || '',
                 lat: f.site.lat != null ? f.site.lat : (ev.site && ev.site.lat), lng: f.site.lng != null ? f.site.lng : (ev.site && ev.site.lng) };
    busy(true); onSource('score', 'busy', 'running the gates…');
    var call;
    try { call = post({ site: site, drawing: f.drawing, run: f.run, evidence: evidence, rep: rep }); }
    catch (e0) { call = Promise.reject(e0); }
    return call.then(function (r) {
      if (!live(gen, pid)) return null;
      st.result = r;
      var S = S_();
      /* ride on the project: the answers and the headline, never the card */
      S.omegaCore = { rep: rep, at: new Date().toISOString(), verdict: r.verdict, units: r.units && r.units.proposed,
                      monthlyPerSkidBase: r.offer ? r.offer.monthlyPerSkid.base : null, termYears: r.terms && r.terms.termYears,
                      leaseSource: r.offer ? r.offer.source : null, rateCardVersion: r.rateCardVersion || null,
                      compute: r.compute && r.compute.cashFlow ? { chipset: r.compute.chipset.key, capex: r.compute.capex.amount, year1Ebitda: r.compute.cashFlow.returns.year1Ebitda,
                                                                  minDscr: r.compute.cashFlow.bankability.minDscrAmortizing, build: r.compute.build } : null };
      /* what is in the fields NOW (typed while the request ran) survives the repaint */
      f.saved = readRep() || rep;
      onSource('score', r.verdict === 'not-qualified' ? 'bad' : (r.verdict === 'qualified' || r.verdict === 'conditional') ? 'ok' : 'warn',
        (r.verdictLabel || r.verdict) + (r.offer ? ' · ' + money(r.offer.monthlyPerSkid.base) + '/skid/mo '
          + (r.offer.source === 'entered' ? 'entered' + (r.offer.indicative ? ' (indicative)' : '') : 'market reference, not an offer') : ' · no lease quoted'));
      busy(false); paint();
      return r;
    }, function (e) {
      if (!live(gen, pid)) return null;
      /* refused (signed out, not on the plan): the lookups are not run for a
         caller the door turned away — they cost time and metered calls */
      if (e && (e.status === 401 || e.status === 403 || /Sign in/.test(e.message || ''))) st.refused = true;
      busy(false); onSource('score', 'bad', (e && e.message) || 'failed');
      log(esc((e && e.message) || 'The Omega-Core service did not answer.'), '#FCA5A5');
      return null;
    });
  }

  /* Gather the evidence (Grid Atlas, fiber, parcel — up to a minute), then score. */
  function screen() {
    if (st.busy) return Promise.resolve(null);
    if (st.refused) { log('Omega-Core is not open to this account, so the lookups were not run.', '#FDE68A'); return Promise.resolve(null); }
    var f = st.facts; if (!f) return Promise.resolve(null);
    var CL = root.OmegaComputeLease;
    if (!CL || typeof CL.evidence !== 'function') { log('The lookup client did not load — qualifying on the drawing and your answers alone.', '#FDE68A'); return rescore(); }
    if (f.site.lat == null && !f.site.address) { log('Set the site\'s address or map pin first — there is nothing to look up.', '#FDE68A'); return rescore(); }
    busy(true); st.sources = {};
    var gen = st.gen, pid = root._projectId || null, key = siteKey(f);
    var units = Math.max(1, num(val('oc-units')) || f.drawing.units || 1);
    return CL.evidence({ lat: f.site.lat, lng: f.site.lng, address: f.site.address, sizeMw: units * 0.135 }, { onSource: onSource })
      .then(function (ev) {
        /* the evidence is the site's, worth keeping whoever asked; the
           follow-up score belongs to the dialog that asked */
        if (pid === (root._projectId || null)) { st.evidence = ev; st.evidenceKey = key; }
        if (!live(gen, pid)) return null;
        busy(false); return rescore();
      }, function (e) {
        if (!live(gen, pid)) return null;
        busy(false); log(esc((e && e.message) || 'The lookups did not run.'), '#FDE68A'); return rescore();
      });
  }

  function runSite() {
    if (st.busy) return;
    if (typeof root.omegaRunAndWait !== 'function') { log('This build has no Run to call.', '#FDE68A'); return; }
    var gen = st.gen, pid = root._projectId || null;
    /* a project just opened has no Run in this session but is not stale, so
       omegaRunAndWait would return at once: mark it stale so it really runs */
    try { if (!S_().costRollup && !S_().running && typeof root.omegaSetStale === 'function') root.omegaSetStale(true); } catch (e) {}
    busy(true); log('Running the site…', '#BAE6FD');
    root.omegaRunAndWait().then(function (finished) {
      if (!live(gen, pid)) return;
      busy(false);
      var rep = readRep();
      st.facts = collect(); if (rep) st.facts.saved = rep;
      paint();
      if (finished === false) log('The Run did not finish in time — try Run on the results rail, then qualify again.', '#FDE68A');
      else if (!S_().costRollup) log('The Run priced nothing on this drawing — place the chargers and equipment, then run it.', '#FDE68A');
      else log('The Run is in. Qualify again to use it.', '#86EFAC');
    });
  }

  function touched(id) { if (id) st.dirty[id] = true; }

  /* A printable summary, printed through a hidden frame so no pop-up
     blocker eats it. Everything on it came back from the server. */
  var PRINT_CSS = '<style>body{font:12px/1.5 Arial,Helvetica,sans-serif;color:#111;margin:28px}h1{font-size:20px;margin:0 0 2px}h2{font-size:13px;margin:18px 0 6px;text-transform:uppercase;letter-spacing:.5px;color:#334155}'
      + 'table{border-collapse:collapse;width:100%}td,th{padding:4px 6px;border-top:1px solid #e2e8f0;text-align:right}td:first-child,th:first-child{text-align:left}th{font-size:10px;color:#64748b;text-transform:uppercase;border-top:0}'
      + 'ul,ol{margin:0;padding-left:18px}.k{color:#64748b;text-align:left}.v{font-weight:700}.small{font-size:10px;color:#64748b}.tiles{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.tile{border:1px solid #e2e8f0;border-radius:8px;padding:8px 10px}.tile .l{font-size:9.5px;color:#64748b;text-transform:uppercase}.tile .n{font-size:15px;font-weight:800}</style>';
  function computePrint(c, full) {
    if (!c || !c.cashFlow) return '';
    var cf = c.cashFlow, cu = c.customer, b = cu.bankability, doc = '';
    doc += '<h2>' + esc(cu.title) + '</h2><div class="tiles">' + cu.headline.map(function (t) { return '<div class="tile"><div class="l">' + esc(t.label) + '</div><div class="n">' + esc(t.value) + '</div></div>'; }).join('') + '</div>';
    doc += '<h2>Bankability</h2><div>' + esc(b.verdict) + '.' + (b.debtCapacityAtTarget != null ? ' At a ' + b.targetDscr.toFixed(2) + 'x target the cash flow carries up to ' + money(b.debtCapacityAtTarget) + ' of debt (' + Math.round(b.ltcAtTargetPct) + '% of cost); ' + money(b.debtFunded) + ' (' + Math.round(b.ltcPct) + '%) is assumed.' : '')
      + (b.balloonMonth ? ' The ' + money(b.balloon) + ' balloon falls in month ' + b.balloonMonth + (b.balloonMonthDscr != null ? ', covered ' + b.balloonMonthDscr.toFixed(2) + 'x from that month\'s operations before the residual' : '') + '.' : '') + (b.repaidInTerm === false ? ' Debt remains outstanding at the end of the term.' : '') + '</div>';
    doc += '<h2>Five years, per skid</h2><table><tr><th>Year</th><th>Revenue</th><th>Operating costs</th>' + (cf.lease.included ? '<th>of which rent to host</th>' : '') + '<th>Operating cash flow</th><th>Debt service</th><th>Equity cash flow</th><th>DSCR</th></tr>'
      + cf.years.map(function (y) { return '<tr><td>' + y.year + '</td><td>' + money(y.revenue) + '</td><td>' + money(y.opex) + '</td>' + (cf.lease.included ? '<td>' + money(y.lease) + '</td>' : '') + '<td class="v">' + money(y.ebitda) + '</td><td>' + money(y.debtService) + '</td><td>' + money(y.equity) + '</td><td>' + (y.dscr != null ? y.dscr.toFixed(2) + 'x' : '—') + '</td></tr>'; }).join('') + '</table>';
    if (c.units > 1 && c.totals) doc += '<div class="small">For ' + c.units + ' skids: capital ' + money(c.totals.capex) + ', debt ' + money(c.totals.debtFunded) + ', initial equity ' + money(c.totals.initialEquity) + ', year-1 revenue ' + money(c.totals.year1Revenue) + ', year-1 operating cash flow ' + money(c.totals.year1Ebitda) + '.</div>';
    doc += '<h2>Assumptions</h2><ul>' + cu.assumptions.map(function (a) { return '<li>' + esc(a) + '</li>'; }).join('') + '</ul>';
    if (full && c.scenarios) {
      doc += '<h2>Every chipset in the same ' + esc(c.inputs.itLoadKw) + ' kW (unlevered)</h2><table><tr><th>Chipset</th><th>Nodes · GPUs</th><th>$/GPU-hr</th><th>Revenue / yr</th><th>Contribution</th><th>Margin</th><th>CAPEX mid</th><th>Payback</th><th>Yield</th></tr>'
        + c.scenarios.rows.map(function (x) { return '<tr><td>' + esc(x.name) + (x.key === c.scenarios.bestYield ? ' ★' : '') + '</td><td>' + x.nodes + ' · ' + x.gpus + '</td>' + (x.priced ? '<td>$' + x.gpuHourPrice.toFixed(2) + '</td><td>' + money(x.annualRevenue) + '</td><td>' + money(x.contribution) + '</td><td>' + pctTxt(x.marginPct, 1) + '</td><td>' + money(x.capexMid) + '</td><td>' + (x.paybackMonths != null ? x.paybackMonths + ' mo' : '—') + '</td><td>' + pctTxt(x.cashOnCashYieldPct, 1) + '</td>' : '<td colspan="7" style="text-align:left">' + esc(x.note || '') + '</td>') + '</tr>'; }).join('') + '</table><div class="small">' + esc(c.scenarios.basis) + '</div>';
      if (c.sensitivity && c.sensitivity.priced) {
        var se = c.sensitivity;
        doc += '<h2>Revenue sensitivity</h2><table><tr><th>Price ↓ / Utilisation →</th>' + se.utilization.map(function (u) { return '<th>' + Math.round(u * 100) + '%</th>'; }).join('') + '</tr>'
          + se.priceRealization.map(function (pr, i) { return '<tr><td>' + Math.round(pr * 100) + '%</td>' + se.annualRevenue[i].map(function (v) { return '<td>' + kTxt(v) + '</td>'; }).join('') + '</tr>'; }).join('') + '</table>';
      }
      if (c.disclosed && c.buildUp) {
        var bu = c.buildUp, k = c.inputs.capexConfig === 'accelerated-liquid' ? 'acc' : 'gp';
        doc += '<h2>Staff only — cost build-up</h2><div class="small">' + esc(bu.sources.capex.what) + '</div><table><tr><th>Category</th><th>Reference low</th><th>Reference high</th><th>Scaled low</th><th>Scaled mid</th><th>Scaled high</th><th>Factor</th></tr>'
          + bu.cmdc.categories.map(function (cat, i) { var dr = bu.dynamicCapex.rows[i]; return '<tr><td>' + esc(cat.label) + '</td><td>' + money(cat[k][0]) + '</td><td>' + money(cat[k][1]) + '</td><td>' + money(dr.low) + '</td><td>' + money(dr.mid) + '</td><td>' + money(dr.high) + '</td><td>' + dr.factor + '×</td></tr>'; }).join('') + '</table>'
          + '<div class="small">Pricing: ' + esc(bu.sources.pricing.what) + ', ' + esc(bu.sources.pricing.asOf) + '. ' + bu.corrections.map(esc).join(' ') + '</div>';
      }
    }
    doc += '<p class="small">' + esc(c.disclaimer || '') + '</p>';
    return doc;
  }
  function printDoc(doc) {
    var fr = document.createElement('iframe');
    fr.setAttribute('style', 'position:fixed;right:0;bottom:0;width:0;height:0;border:0');
    document.body.appendChild(fr);
    try {
      var d = fr.contentWindow.document; d.open(); d.write(doc); d.close();
      setTimeout(function () { try { fr.contentWindow.focus(); fr.contentWindow.print(); } catch (e) {} setTimeout(function () { fr.remove(); }, 1500); }, 150);
    } catch (e) { fr.remove(); }
  }
  /* The customer version: the skid, the site's verdict in one line, the
     lease, the compute economics and their assumptions in plain words — no
     gate basis, no cost build-up, no third-party price sheet. */
  function printCustomer(r, f) {
    var b = r.brand || {}, o = r.offer, t = r.terms || {};
    var doc = '<!doctype html><html><head><meta charset="utf-8"><title>Omega Core Skid — ' + esc(f.site.name || f.site.address || 'site') + '</title>' + PRINT_CSS + '</head><body>'
      + '<div class="small">' + esc(b.name || 'ClearSky') + ' · Omega Core Skid · ' + esc(new Date().toISOString().slice(0, 10)) + '</div>'
      + '<h1>' + esc(f.site.name || 'Omega Core Skid') + '</h1><div>' + esc(f.site.address || '') + '</div>'
      + '<h2>The skid</h2><div>' + esc(r.product.compute.kw) + ' kW of edge compute with a ' + esc(r.product.battery.kwh) + ' kWh / ' + esc(r.product.battery.kw) + ' kW battery on one ' + esc(r.product.skid.lengthIn) + ' × ' + esc(r.product.skid.depthIn) + ' in skid, on its own utility meter. '
      + esc(t.ownership || '') + ' ' + esc(t.minTermYears) + '-year minimum; ' + esc((t.endOfTerm || {}).remove || '') + ' ' + esc((t.endOfTerm || {}).buyout || '') + '</div>'
      + '<h2>Site</h2><div class="v">' + esc((VERDICT[r.verdict] || ['', r.verdictLabel || r.verdict])[1]) + ' — ' + esc(r.units.proposed) + ' skid' + (r.units.proposed > 1 ? 's' : '') + '</div><div>' + esc(r.verdictReason) + '</div>';
    if (o) doc += '<h2>' + esc(o.label || 'Land lease to the host') + '</h2><div>' + money(o.monthlyPerSkid.base) + ' per skid per month' + (o.source === 'market' ? ' (market reference ' + money(o.monthlyPerSkid.low) + '–' + money(o.monthlyPerSkid.high) + ', not an offer)' : '') + ' · ' + money(o.annual.base) + ' a year for ' + esc(o.units) + ' skid' + (o.units > 1 ? 's' : '') + ' · ' + money(o.termTotal.base) + ' over ' + esc(o.termYears) + ' years at ' + esc(o.escalatorPct.base) + '%/yr.</div>';
    doc += computePrint(r.compute, false);
    doc += '<p class="small">' + esc(r.disclaimer) + '</p></body></html>';
    return doc;
  }

  function print(mode) {
    var r = st.result, f = st.facts; if (!r || !f) return;
    if (mode === 'customer') return printDoc(printCustomer(r, f));
    var b = r.brand || {};
    var doc = '<!doctype html><html><head><meta charset="utf-8"><title>Omega-Core — ' + esc(f.site.name || f.site.address || 'site') + '</title>' + PRINT_CSS + '</head><body>';
    doc += '<div class="small">' + esc(b.name || 'ClearSky') + ' · Omega-Core site qualification · ' + esc(new Date().toISOString().slice(0, 10)) + '</div>'
      + '<h1>' + esc(f.site.name || 'Omega-Core site') + '</h1><div>' + esc(f.site.address || '') + '</div>'
      + '<h2>Verdict</h2><div class="v">' + esc((VERDICT[r.verdict] || ['', r.verdictLabel || r.verdict])[1]) + ' — ' + esc(r.units.proposed) + ' skid' + (r.units.proposed > 1 ? 's' : '') + '</div><div>' + esc(r.verdictReason) + '</div>'
      + '<h2>The skid</h2><div>' + esc(r.product.compute.model) + ' ' + esc(r.product.compute.kw) + ' kW + ' + esc(r.product.battery.model) + ' ' + esc(r.product.battery.kwh) + ' kWh / ' + esc(r.product.battery.kw) + ' kW (' + esc(r.product.battery.pcs) + ', ' + esc(r.product.battery.acV) + ') on one '
      + esc(r.product.skid.lengthIn) + ' × ' + esc(r.product.skid.depthIn) + ' in skid · its own utility meter</div>'
      + '<h2>Gates</h2><table>' + (r.gateOrder || []).map(function (k) { var g = r.gates[k]; return '<tr><td class="k">' + esc(g.label) + '</td><td class="v">' + esc((QUAL[g.qualification] || ['', g.status])[1]) + '</td><td>' + esc(g.headline) + '</td></tr>'; }).join('') + '</table>';
    if (r.offer) doc += '<h2>' + esc(r.offer.label || 'Land lease') + '</h2><table><tr><td class="k">Per skid, per month</td><td class="v">' + money(r.offer.monthlyPerSkid.base) + '</td><td class="small">'
      + (r.offer.source === 'entered' ? 'entered for this site' : 'market reference ' + money(r.offer.monthlyPerSkid.low) + '–' + money(r.offer.monthlyPerSkid.high) + ', base shown') + '</td></tr>'
      + '<tr><td class="k">Per year, ' + esc(r.offer.units) + ' skid' + (r.offer.units > 1 ? 's' : '') + '</td><td class="v">' + money(r.offer.annual.base) + '</td><td></td></tr>'
      + '<tr><td class="k">Over ' + esc(r.offer.termYears) + ' years, escalating ' + esc(r.offer.escalatorPct.base) + '%</td><td class="v">' + money(r.offer.termTotal.base) + '</td><td></td></tr></table>'
      + (r.offer.market && r.offer.market.sources ? '<p class="small">' + esc(r.offer.market.note) + ' ' + r.offer.market.sources.map(function (x) { return esc(x.what) + ': ' + esc(x.figure) + ' (' + esc(x.url) + ')'; }).join(' · ') + '</p>' : '');
    var hs = r.host || {};
    if (r.offer && hs.run && hs.run.capex != null) doc += '<h2>The charging site, from the Run</h2><table><tr><td class="k">Capex</td><td class="v">' + money(hs.run.capex) + '</td></tr><tr><td class="k">Year-1 revenue</td><td class="v">' + money(hs.run.annualRevenue) + '</td></tr>'
      + (hs.paybackYearsBefore != null || hs.paybackYearsAfter != null ? '<tr><td class="k">Payback (before → with the lease)</td><td class="v">' + esc(paybackText(hs)) + '</td></tr>' : '')
      + (hs.revenueUpliftPct != null ? '<tr><td class="k">Revenue uplift</td><td class="v">' + hs.revenueUpliftPct + '%</td></tr>' : '') + '</table>';
    var t = r.terms || {}, p = r.program || {}, fmv = p.fmvAtEndPerSkid || {};
    doc += '<h2>Terms</h2><ul><li>' + esc(t.minTermYears) + '-year minimum term. ' + esc(t.renewal) + '</li><li>' + esc(t.meter) + '</li><li>' + esc(t.ownership) + '</li><li>' + esc((t.endOfTerm || {}).remove) + '</li><li>' + esc((t.endOfTerm || {}).buyout)
      + ' Indicative: ' + money(fmv.low) + '–' + money(fmv.high) + ' per skid at year ' + esc((t.endOfTerm || {}).year) + ' on a ' + money(p.systemCostPerSkid) + ' system.</li></ul>';
    if (r.asks && r.asks.length) doc += '<h2>' + (r.verdict === 'qualified' || r.verdict === 'conditional' ? 'Still to do' : 'What it needs to qualify') + '</h2><ol>' + r.asks.map(function (a) { return '<li>' + esc(a.gate) + ': ' + esc(a.ask) + '</li>'; }).join('') + '</ol>';
    doc += computePrint(r.compute, true);
    doc += '<p class="small">' + esc(r.disclaimer) + ' Lease card ' + esc(r.rateCardVersion) + '.</p></body></html>';
    printDoc(doc);
  }

  function open() {
    try { st.facts = collect(); } catch (e) {
      host().innerHTML = '<div style="background:var(--panel);border:1px solid var(--border);border-radius:12px;padding:20px;color:#FCA5A5;max-width:520px">Could not read this project: ' + esc(e && e.message) + '</div>';
      return;
    }
    if (st.evidenceKey && st.evidenceKey !== siteKey(st.facts)) { st.evidence = null; st.evidenceKey = null; st.sources = {}; }
    st.result = null; st.refused = false; st.dirty = {}; st.gen++; st.busy = false;
    paint();
    /* Score at once on what the project holds, then gather the evidence
       for this site the first time the dialog opens on it. */
    rescore().then(function (r) { if (r && !st.evidence) screen(); });
  }

  root.OmegaCoreQualify = { open: open, close: close, screen: screen, rescore: rescore, runSite: runSite,
                            print: print, touched: touched, collect: collect, API: API };
})(typeof window !== 'undefined' ? window : this);
