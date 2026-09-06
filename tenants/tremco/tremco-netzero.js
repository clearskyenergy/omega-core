/* ═══════════════════════════════════════════════════════════════════════════════
   /tremco-netzero.js — TENANT MODULE (Tremco Roofing & Building Maintenance)

   Rolls the editor's per-zone Building/Net-Zero analysis up into client- and
   asset-level KPIs on the portal dashboard.

   WHY THIS IS A SEPARATE FILE
   index.html is shared byte-identical across every tenant, so the dashboard's
   own KPIs (sites under control, MWh quoted, interconnect stage) cannot be
   swapped out for Tremco without forking it. This module is loaded by
   /config.js — which IS tenant-specific — and appends its own panel. No shared
   file is touched.

   WHAT IT READS
   The editor stores each drawn zone in the project document's `shapes` array.
   A zone that has been through the Building / Net-Zero panel carries a `bnz`
   block (its inputs). Geometry and energy results are DERIVED in the editor and
   deliberately never stored, so:

     • Geometry KPIs   — recomputed here from shapes[].pts + pxPerFt.  LIVE NOW.
     • Compliance KPIs — LL97 applicability and caps, from stored gfa + occGroup
                         + bpsJurisdiction.                            LIVE NOW.
     • Energy KPIs     — EUI, net EUI, tCO2e, penalty exposure. These need the
                         editor's energy engine and CANNOT be recomputed here
                         without duplicating it. They light up as soon as the
                         editor persists a `netZero` summary on save.
                         See README → "Wiring the editor's net-zero results".

   Until that upstream change ships, the energy tier renders as "Not yet
   captured" rather than as zeros. A zero and a missing measurement are not the
   same claim, and a dashboard that conflates them will get someone to quote a
   roof off a number nobody computed.
   ═══════════════════════════════════════════════════════════════════════════════ */
(function () {
'use strict';

var TAG = '[tremco-netzero]';

/* ── Reference data ────────────────────────────────────────────────────────
   Copied from BPS_TARGETS / BPS_OCC_MAP in editor.html. This is the SECOND
   copy — the editor's engine is not reachable from this page. If NYC revises
   the caps, both must change. The `asOf` below is the editor's own stamp;
   compare it before trusting a penalty figure.

   Caps are tCO2e/sf/yr by occupancy group, indexed by period. Getting the unit
   wrong by 1000x makes every building fail every period. */
var LL97 = {
  asOf: '2026-08-10',
  minGsf: 25000,
  penaltyPerTco2eOver: 268,
  periods: [
    { label: '2024–2029', start: 2024, end: 2029, conf: 'published'   },
    { label: '2030–2034', start: 2030, end: 2034, conf: 'published'   },
    { label: '2035–2039', start: 2035, end: 2039, conf: 'provisional' },
    { label: '2040–2049', start: 2040, end: 2049, conf: 'provisional' },
    { label: '2050',      start: 2050, end: null, conf: 'statutory'   }
  ],
  caps: {
    'A':   [0.01074, 0.00420, 0.00280, 0.00140, 0],
    'B':   [0.00846, 0.00453, 0.00302, 0.00151, 0],
    'E':   [0.00758, 0.00344, 0.00229, 0.00115, 0],
    'F':   [0.00574, 0.00167, 0.00111, 0.00056, 0],
    'I-2': [0.02381, 0.01193, 0.00795, 0.00398, 0],
    'M':   [0.01181, 0.00403, 0.00269, 0.00134, 0],
    'R-1': [0.00987, 0.00526, 0.00351, 0.00175, 0],
    'R-2': [0.00675, 0.00407, 0.00271, 0.00136, 0],
    'S':   [0.00426, 0.00110, 0.00073, 0.00037, 0],
    'U':   [0.00426, 0.00110, 0.00073, 0.00037, 0]
  }
};

var OCC_MAP = {
  office:'B', warehouse:'S', retail:'M', school:'E', hospital:'I-2',
  hotel:'R-1', multifamily:'R-2', worship:'A', manufacturing:'F', datacenter:'B'
};

/* Performance bands. Taken from the NBI / NYSERDA Getting to Zero list
   definitions rather than invented, so a number on this dashboard means the
   same thing it means in the report a client is comparing it against:

     Net Zero Energy   net EUI <= 0 over a year
     High Performance  predicted energy use >= 30% below the code in effect
     Below benchmark   under the property-type benchmark, but short of 30%

   "Certified" and "Verified" are third-party states (ILFI, NBI) and are NOT
   inferred here — a modelled result must never be counted as a verified one. */
var BAND = {
  NZE:        'nze',
  HIGH_PERF:  'highPerf',
  BELOW_BENCH:'belowBench',
  ABOVE_BENCH:'aboveBench'
};
var HIGH_PERF_THRESHOLD = 0.30;

/* ── Small helpers ───────────────────────────────────────────────────────── */
function cfg(){ return window.CLEARSKY_CONFIG || {}; }
function tenant(){ return cfg().tenant || {}; }
function num(v){ var n = Number(v); return isFinite(n) ? n : 0; }
function esc(s){
  return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
  });
}
function fmtSf(n){
  if (!n) return '0';
  if (n >= 1000000) return (n/1000000).toFixed(2).replace(/\.00$/,'') + 'M';
  if (n >= 1000)    return Math.round(n/1000) + 'k';
  return String(Math.round(n));
}
function fmtMoney(n){
  if (!n) return '$0';
  if (n >= 1000000) return '$' + (n/1000000).toFixed(1) + 'M';
  if (n >= 1000)    return '$' + Math.round(n/1000) + 'k';
  return '$' + Math.round(n);
}
function pct(a, b){ return b > 0 ? Math.round((a/b)*100) : 0; }

/* ── Geometry ──────────────────────────────────────────────────────────────
   Shoelace in feet, mirroring bnzGeometry() in editor.html. Two-corner kinds
   (zonebox, substation) store opposite corners and are expanded to four
   vertices first — miss that and every zone box reports zero area, which is
   most of them.

   pxPerFt is per-PROJECT. A project saved before the user set a scale has no
   pxPerFt, so its zones have no real-world area. Those are counted separately
   as "unscaled" rather than folded in as zero. */
function zoneGeometry(shape, pxPerFt){
  var out = { ok:false, footprintSf:0, gfaSf:0, roofSf:0, wallSf:0, perimeterFt:0 };
  if (!shape || !shape.pts || shape.pts.length < 2) return out;
  if (!(pxPerFt > 0)) return out;

  var b = shape.bnz || {};
  var pts = shape.pts.slice();
  if ((shape.kind === 'zonebox' || shape.kind === 'substation') && pts.length === 2){
    var a = pts[0], c = pts[1];
    pts = [{x:a.x,y:a.y},{x:c.x,y:a.y},{x:c.x,y:c.y},{x:a.x,y:c.y}];
  }
  if (pts.length < 3) return out;

  var area2 = 0, per = 0;
  for (var i = 0; i < pts.length; i++){
    var p = pts[i], q = pts[(i+1) % pts.length];
    area2 += (p.x*q.y - q.x*p.y);
    per += Math.hypot((q.x-p.x)/pxPerFt, (q.y-p.y)/pxPerFt);
  }

  var stories = num(b.stories) || 1;
  var wallH   = stories * num(b.f2f) + num(b.parapet);

  out.ok          = true;
  out.footprintSf = Math.abs(area2/2) / (pxPerFt*pxPerFt);
  out.perimeterFt = per;
  out.gfaSf       = out.footprintSf * stories;
  /* roofOn defaults true in bnzDefault(); only an explicit false excludes it. */
  out.roofSf      = (b.roofOn === false) ? 0 : out.footprintSf;
  out.wallSf      = per * wallH;
  return out;
}

/* ── LL97 ──────────────────────────────────────────────────────────────────
   Applicability only needs stored data. The cap comparison additionally needs
   annual tCO2e, which only the editor can produce — so `overBy` and `penalty`
   stay null until a persisted summary supplies emissions. */
function currentPeriodIndex(year){
  for (var i = 0; i < LL97.periods.length; i++){
    var p = LL97.periods[i];
    if (year >= p.start && (p.end === null || year <= p.end)) return i;
  }
  return LL97.periods.length - 1;
}

function ll97For(bnz, gfaSf, tco2ePerYr, year){
  var out = { applies:false, occGroup:null, cap:null, capTco2e:null,
              overBy:null, penalty:null, altPathway:null, period:null, conf:null };
  if (!bnz) return out;
  if ((bnz.bpsJurisdiction || 'nyc_ll97') !== 'nyc_ll97') return out;
  if (!(gfaSf >= LL97.minGsf)) return out;

  var occ = bnz.occGroup || OCC_MAP[bnz.propertyType] || null;
  var caps = occ ? LL97.caps[occ] : null;
  if (!caps) return out;

  var idx = currentPeriodIndex(year);
  out.applies    = true;
  out.occGroup   = occ;
  out.period     = LL97.periods[idx].label;
  out.conf       = LL97.periods[idx].conf;
  out.cap        = caps[idx];
  out.capTco2e   = caps[idx] * gfaSf;
  out.altPathway = bnz.altPathway && bnz.altPathway !== 'none' ? bnz.altPathway : null;

  if (tco2ePerYr != null){
    var over = tco2ePerYr - out.capTco2e;
    out.overBy  = over > 0 ? over : 0;
    out.penalty = out.overBy * LL97.penaltyPerTco2eOver;
  }
  return out;
}

/* ── Performance band ──────────────────────────────────────────────────────
   Reads a persisted netZero summary. Returns null when the project has not
   been through the editor's energy engine — the caller must NOT treat that as
   "above benchmark". */
function bandOf(nz){
  if (!nz) return null;
  if (nz.netEui != null && nz.netEui <= 0) return BAND.NZE;
  var prop = nz.proposedEui, bench = nz.benchmarkEui;
  if (prop == null || !(bench > 0)) return null;
  var savings = (bench - prop) / bench;
  if (savings >= HIGH_PERF_THRESHOLD) return BAND.HIGH_PERF;
  if (savings > 0) return BAND.BELOW_BENCH;
  return BAND.ABOVE_BENCH;
}

/* ── Rollup ────────────────────────────────────────────────────────────────
   One pass over the org's projects. Every zone carrying a `bnz` block counts
   as an analysed building.

   Client attribution: the editor stores a per-project brand block with
   companyName — that is the CLIENT the drawing was issued for, which is
   exactly the grouping Tremco wants. Falls back to the project's own client
   field, then to Unassigned. */
function rollup(docs, year){
  var R = {
    projects:0, buildings:0, unscaledZones:0,
    clients:{}, byPropertyType:{}, byDelivery:{ new_build:0, retrofit:0, other:0 },
    roofSf:0, gfaSf:0, wallSf:0, footprintSf:0,
    energyCaptured:0,
    bands:{ nze:0, highPerf:0, belowBench:0, aboveBench:0 },
    ll97Applicable:0, ll97Compliant:0, ll97Over:0,
    ll97PenaltyExposure:0, ll97CapTco2e:0, ll97AltPathway:0,
    ll97AssessedForCap:0,
    rows:[]
  };

  docs.forEach(function(d){
    var shapes = d.shapes || [];
    var pxPerFt = num(d.pxPerFt);
    var summaries = (d.netZero && d.netZero.zones) || {};
    var client = (d.brand && d.brand.companyName) || d.client || d.customer || 'Unassigned';
    var counted = false;

    shapes.forEach(function(sh){
      if (!sh || !sh.bnz) return;           // zone never opened in Building/Net-Zero
      var b = sh.bnz;
      R.buildings++;
      if (!counted){ R.projects++; counted = true; }

      var g = zoneGeometry(sh, pxPerFt);
      if (!g.ok){ R.unscaledZones++; }

      R.footprintSf += g.footprintSf;
      R.gfaSf       += g.gfaSf;
      R.roofSf      += g.roofSf;
      R.wallSf      += g.wallSf;

      var ptype = b.propertyType || 'other';
      R.byPropertyType[ptype] = (R.byPropertyType[ptype] || 0) + 1;

      var del = b.delivery === 'new_build' ? 'new_build'
              : (b.delivery ? 'retrofit' : 'other');
      R.byDelivery[del]++;

      /* Persisted energy summary, keyed by shape id. Absent until the editor
         writes one — see the header note. */
      var nz = summaries[sh.id] || null;
      var band = bandOf(nz);
      if (nz){ R.energyCaptured++; }
      if (band){ R.bands[band]++; }

      var ll = ll97For(b, g.gfaSf, nz ? nz.tco2ePerYr : null, year);
      if (ll.applies){
        R.ll97Applicable++;
        R.ll97CapTco2e += ll.capTco2e || 0;
        if (ll.altPathway) R.ll97AltPathway++;
        if (ll.penalty != null){
          R.ll97AssessedForCap++;
          if (ll.penalty > 0){ R.ll97Over++; R.ll97PenaltyExposure += ll.penalty; }
          else { R.ll97Compliant++; }
        }
      }

      var c = R.clients[client] || (R.clients[client] = {
        name:client, buildings:0, roofSf:0, gfaSf:0, nze:0, highPerf:0,
        ll97Applicable:0, ll97Over:0, penalty:0
      });
      c.buildings++;
      c.roofSf += g.roofSf;
      c.gfaSf  += g.gfaSf;
      if (band === BAND.NZE) c.nze++;
      if (band === BAND.HIGH_PERF) c.highPerf++;
      if (ll.applies){ c.ll97Applicable++; if (ll.penalty > 0){ c.ll97Over++; c.penalty += ll.penalty; } }

      R.rows.push({
        client:client, project:d.name || 'Untitled', zone:b.name || 'Building',
        propertyType:ptype, delivery:del, gfaSf:g.gfaSf, roofSf:g.roofSf,
        band:band, ll97:ll, scaled:g.ok
      });
    });
  });

  return R;
}

/* ── Rendering ─────────────────────────────────────────────────────────────
   Tiles carry an explicit state. `pending` renders an em-dash and a reason,
   never a zero. */
function tile(label, value, sub, state){
  var cls = 'tnz-tile' + (state ? ' tnz-' + state : '');
  return '<div class="' + cls + '">'
       +   '<div class="tnz-v">' + value + '</div>'
       +   '<div class="tnz-l">' + esc(label) + '</div>'
       +   (sub ? '<div class="tnz-s">' + sub + '</div>' : '')
       + '</div>';
}

function styles(){
  if (document.getElementById('tnz-css')) return;
  var el = document.createElement('style');
  el.id = 'tnz-css';
  el.textContent = [
    '#tnz-panel{margin:22px 0 8px;font:400 13px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}',
    '#tnz-panel .tnz-head{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin:0 0 4px}',
    '#tnz-panel .tnz-title{font-size:15px;font-weight:700;color:#0F1B2A;margin:0}',
    '#tnz-panel .tnz-rule{height:3px;background:#00AA91;border-radius:2px;width:44px;margin:6px 0 14px}',
    '#tnz-panel .tnz-note{font-size:11.5px;color:#64748B}',
    '#tnz-panel .tnz-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:16px}',
    '#tnz-panel .tnz-tile{background:#fff;border:1px solid #E4E9F0;border-left:3px solid #00AA91;',
    'border-radius:8px;padding:12px 14px}',
    '#tnz-panel .tnz-pending{border-left-color:#CBD5E1;background:#FAFBFC}',
    '#tnz-panel .tnz-warn{border-left-color:#C0392B}',
    '#tnz-panel .tnz-v{font-size:23px;font-weight:700;color:#0F1B2A;letter-spacing:-.4px;line-height:1.1}',
    '#tnz-panel .tnz-pending .tnz-v{color:#94A3B8}',
    '#tnz-panel .tnz-l{font-size:11px;font-weight:600;color:#475569;margin-top:5px;text-transform:uppercase;letter-spacing:.03em}',
    '#tnz-panel .tnz-s{font-size:10.5px;color:#7C8AA0;margin-top:3px}',
    '#tnz-panel .tnz-sec{font-size:11px;font-weight:700;color:#00806E;text-transform:uppercase;',
    'letter-spacing:.06em;margin:2px 0 8px}',
    '#tnz-panel table{width:100%;border-collapse:collapse;font-size:12px;background:#fff;',
    'border:1px solid #E4E9F0;border-radius:8px;overflow:hidden}',
    '#tnz-panel th{text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.04em;',
    'color:#64748B;padding:9px 12px;background:#F6F8FA;border-bottom:1px solid #E4E9F0;font-weight:700}',
    '#tnz-panel td{padding:9px 12px;border-bottom:1px solid #F1F4F8;color:#243447}',
    '#tnz-panel tr:last-child td{border-bottom:none}',
    '#tnz-panel td.num,#tnz-panel th.num{text-align:right;font-variant-numeric:tabular-nums}',
    '#tnz-panel .tnz-empty{background:#fff;border:1px dashed #CBD5E1;border-radius:8px;',
    'padding:22px;text-align:center;color:#64748B;font-size:12.5px}'
  ].join('');
  document.head.appendChild(el);
}

function render(R, year){
  var host = document.getElementById('tnz-panel');
  if (!host) return;

  var periodLabel = LL97.periods[currentPeriodIndex(year)].label;
  var h = '';

  h += '<div class="tnz-head"><h3 class="tnz-title">Client &amp; Asset Analysis</h3>'
     + '<span class="tnz-note">Net-zero rollup across every zone analysed in the Site Map editor</span></div>'
     + '<div class="tnz-rule"></div>';

  if (!R.buildings){
    h += '<div class="tnz-empty">No buildings analysed yet. Open a project in the '
       + '<b>BESS Site Map</b> editor, draw a zone, then use <b>Building / Net-Zero</b> '
       + 'to assign roof, wall and glazing assemblies. Analysed zones roll up here automatically.</div>';
    host.innerHTML = h;
    return;
  }

  /* ── Coverage ─────────────────────────────────────────────────────────── */
  var clientCount = Object.keys(R.clients).length;
  h += '<div class="tnz-sec">Coverage</div><div class="tnz-grid">';
  h += tile('Clients analysed', clientCount, R.projects + ' project' + (R.projects===1?'':'s'));
  h += tile('Buildings analysed', R.buildings,
            R.unscaledZones ? R.unscaledZones + ' without a drawing scale' : 'all scaled');
  h += tile('Roof area analysed', fmtSf(R.roofSf) + ' sf', 'the serviceable asset');
  h += tile('Gross floor area', fmtSf(R.gfaSf) + ' sf', fmtSf(R.wallSf) + ' sf wall');
  h += tile('Retrofit vs new', R.byDelivery.retrofit + ' / ' + R.byDelivery.new_build,
            'existing stock vs new build');
  h += '</div>';

  /* ── Performance ──────────────────────────────────────────────────────── */
  var haveEnergy = R.energyCaptured > 0;
  var pendMsg = 'awaiting editor summary';
  h += '<div class="tnz-sec">Net-zero performance</div><div class="tnz-grid">';
  h += tile('Energy modelled', R.energyCaptured + ' / ' + R.buildings,
            haveEnergy ? pct(R.energyCaptured, R.buildings) + '% of analysed buildings'
                       : 'editor is not yet persisting results',
            haveEnergy ? '' : 'pending');
  h += tile('Net zero energy', haveEnergy ? R.bands.nze : '—',
            haveEnergy ? 'net EUI at or below zero' : pendMsg,
            haveEnergy ? '' : 'pending');
  h += tile('High performance', haveEnergy ? R.bands.highPerf : '—',
            haveEnergy ? '30%+ below code' : pendMsg,
            haveEnergy ? '' : 'pending');
  h += tile('Below benchmark', haveEnergy ? R.bands.belowBench : '—',
            haveEnergy ? 'under type benchmark' : pendMsg,
            haveEnergy ? '' : 'pending');
  h += tile('Above benchmark', haveEnergy ? R.bands.aboveBench : '—',
            haveEnergy ? 'retrofit opportunity' : pendMsg,
            haveEnergy ? '' : 'pending');
  h += '</div>';

  /* ── Compliance & incentive ───────────────────────────────────────────── */
  var haveCarbon = R.ll97AssessedForCap > 0;
  h += '<div class="tnz-sec">LL97 compliance &amp; incentive exposure · ' + esc(periodLabel) + '</div>'
     + '<div class="tnz-grid">';
  h += tile('LL97-applicable', R.ll97Applicable,
            'at or above ' + fmtSf(LL97.minGsf) + ' sf');
  h += tile('Assessed vs cap', haveCarbon ? R.ll97AssessedForCap + ' / ' + R.ll97Applicable : '—',
            haveCarbon ? 'have emissions data' : pendMsg,
            haveCarbon ? '' : 'pending');
  h += tile('Over cap', haveCarbon ? R.ll97Over : '—',
            haveCarbon ? 'penalty-exposed' : pendMsg,
            haveCarbon ? (R.ll97Over ? 'warn' : '') : 'pending');
  h += tile('Annual exposure', haveCarbon ? fmtMoney(R.ll97PenaltyExposure) : '—',
            haveCarbon ? '$' + LL97.penaltyPerTco2eOver + '/tCO2e over' : pendMsg,
            haveCarbon ? (R.ll97PenaltyExposure ? 'warn' : '') : 'pending');
  h += tile('Alt-pathway filed', R.ll97AltPathway,
            'Art. 321 and related routes');
  h += '</div>';

  /* ── Per-client table ─────────────────────────────────────────────────── */
  var clients = Object.keys(R.clients).map(function(k){ return R.clients[k]; })
                  .sort(function(a,b){ return b.roofSf - a.roofSf; });
  h += '<div class="tnz-sec">By client</div><table><thead><tr>'
     + '<th>Client</th><th class="num">Buildings</th><th class="num">Roof sf</th>'
     + '<th class="num">GFA sf</th><th class="num">NZE</th><th class="num">High perf</th>'
     + '<th class="num">LL97</th><th class="num">Over cap</th></tr></thead><tbody>';
  clients.forEach(function(c){
    h += '<tr><td>' + esc(c.name) + '</td>'
       + '<td class="num">' + c.buildings + '</td>'
       + '<td class="num">' + fmtSf(c.roofSf) + '</td>'
       + '<td class="num">' + fmtSf(c.gfaSf) + '</td>'
       + '<td class="num">' + (haveEnergy ? c.nze : '—') + '</td>'
       + '<td class="num">' + (haveEnergy ? c.highPerf : '—') + '</td>'
       + '<td class="num">' + c.ll97Applicable + '</td>'
       + '<td class="num">' + (haveCarbon ? c.ll97Over : '—') + '</td></tr>';
  });
  h += '</tbody></table>';

  h += '<div class="tnz-note" style="margin-top:10px">'
     + 'LL97 caps as published, checked ' + esc(LL97.asOf) + '. '
     + 'Modelled figures are screening estimates, not third-party verified performance.'
     + '</div>';

  host.innerHTML = h;
}

/* ── Mount ─────────────────────────────────────────────────────────────────
   Waits for #kpi-grid (the shared dashboard's own KPI block) and inserts after
   it. Polls rather than assuming load order, because config.js runs before the
   dashboard markup is parsed. Gives up quietly after ~20s so a layout change
   upstream degrades to "panel missing" rather than a spinning loop. */
function mount(){
  var anchor = document.getElementById('kpi-grid');
  if (!anchor) return false;
  if (document.getElementById('tnz-panel')) return true;
  styles();
  var panel = document.createElement('section');
  panel.id = 'tnz-panel';
  panel.innerHTML = '<div class="tnz-note">Loading client &amp; asset analysis…</div>';
  anchor.parentNode.insertBefore(panel, anchor.nextSibling);
  return true;
}

async function load(){
  var db, orgId = tenant().orgId;
  try { db = firebase.firestore(); }
  catch(e){ console.warn(TAG, 'Firestore unavailable:', e && e.message); return; }
  if (!orgId){ console.warn(TAG, 'No tenant.orgId in /config.js — nothing to scope to.'); return; }

  try {
    var snap = await db.collection('projects').where('orgId','==',orgId).get();
    var docs = [];
    snap.forEach(function(doc){ docs.push(doc.data()); });
    var year = new Date().getFullYear();
    var R = rollup(docs, year);
    render(R, year);
    console.info(TAG, R.buildings + ' building(s) across ' + R.projects + ' project(s); '
                    + R.energyCaptured + ' with persisted energy results.');
  } catch(e){
    console.error(TAG, 'Rollup failed:', e);
    var host = document.getElementById('tnz-panel');
    if (host){
      host.innerHTML = '<div class="tnz-empty">Client &amp; asset analysis is unavailable right now. '
                     + 'Your other dashboard numbers are unaffected.</div>';
    }
  }
}

/* Deliberately scoped to the org, NOT to the signed-in user. The shared
   dashboard above is locked to a personal view; this panel is the company-wide
   asset picture, which is the whole point of a client-and-asset rollup. */
function start(){
  var tries = 0;
  var iv = setInterval(function(){
    tries++;
    if (mount()){
      clearInterval(iv);
      if (window.firebase && firebase.apps && firebase.apps.length){
        firebase.auth().onAuthStateChanged(function(u){ if (u) load(); });
      } else {
        console.warn(TAG, 'Firebase not initialised; panel will stay empty.');
      }
    } else if (tries > 200){
      clearInterval(iv);
      console.warn(TAG, '#kpi-grid never appeared — dashboard markup may have changed upstream.');
    }
  }, 100);
}

if (document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', start);
} else {
  start();
}

/* Exposed for the editor-side bridge, the offline preview, and for testing. */
window.TremcoNetZero = { rollup:rollup, zoneGeometry:zoneGeometry, ll97For:ll97For,
                         bandOf:bandOf, LL97:LL97, reload:load,
                         render:render, styles:styles, mount:mount };

})();
