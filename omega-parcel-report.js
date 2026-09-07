/* ═══════════════════════════════════════════════════════════════════════════════
   omega-parcel-report.js — the Parcel Screening Register, as a document
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   Takes the rows the Parcel Screening Register already holds — [{ name, intake,
   grid }], exactly what OmegaSiteIntel.analyzeKMZ returns — and renders the
   full screening report: masthead, caveat, summary strip, ranked records with
   per-component bars and every flag in prose, the scoring method, and the
   voltage-class capacity table.

     OmegaParcelReport.html(rows, opts)   -> a complete HTML document, as a string
     OmegaParcelReport.open(rows, opts)   -> opens it in a new tab
     OmegaParcelReport.print(rows, opts)  -> opens it and calls print (→ PDF)

   NOTHING IS RECOMPUTED HERE. Every number on the page is read off the engine's
   own output, and the two tables that could drift — the component weights and
   the kV → planning-capacity ladder — are read from OmegaSiteIntel rather than
   restated. A report that quietly disagrees with the engine that produced it is
   worse than no report, because it is the version that gets emailed.

   THE CAVEAT IS NOT BOILERPLATE. This document ranks parcels off lines somebody
   drew by eye over imagery. It cannot see queue position, thermal ratings, ATC
   or curtailment history, so a 345 kV line on the fence with a full queue behind
   it scores well here and is undevelopable. The caveat, the confidence grade and
   the per-component breakdown all exist so the number is never read alone —
   removing any of them turns a work order into a claim.

   ES5 on purpose: this loads in the editor and in the field tools.
   ═══════════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var VERSION = 'parcel-report/1.0';

  /* Component colour per key. The method section and the bars read the same
     map, so a component added to the engine shows up in both or in neither. */
  var CVAR = { voltage: '--c1', distance: '--c2', redundancy: '--c3',
               land: '--c4', gas: '--c5' };

  /* Why each component is weighted the way it is. Prose, not arithmetic — the
     points come from OmegaSiteIntel.WEIGHTS. */
  var WHY = {
    voltage: 'The ceiling on how much load can ever be served. It outweighs distance ' +
      'because distance is money and voltage is a limit — you can pay to cross five ' +
      'miles, but you cannot buy headroom onto a 69&nbsp;kV line that has none.',
    distance: 'To the point of interconnection. The gen-tie is the first cheque written. ' +
      'A line tap scores at a penalty against a substation, because tapping one still ' +
      'means building a switchyard.',
    redundancy: 'Two circuits at the top voltage is the ask. A compute buyer prices a ' +
      'single point of failure, and a 345 sharing a corridor with a 69 is not a second ' +
      'source.',
    land: 'Scored against what the grid can actually deliver at roughly 2.25&nbsp;MW an ' +
      'acre, not in the abstract. Two thousand acres on a 69&nbsp;kV line is not a ' +
      'two-thousand-acre data centre.',
    gas: 'Not power, but what carries a site to revenue while a four-year queue runs. ' +
      'Diameter is the proxy for deliverability, discounted with distance.'
  };

  var LABEL = { voltage: 'Voltage', distance: 'Distance', redundancy: 'Redundancy',
                land: 'Land', gas: 'Gas', hazard: 'Hazard' };

  /* ── helpers ─────────────────────────────────────────────────────────── */
  function SI() { return global.OmegaSiteIntel || null; }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function n0(v) { return (Math.round(+v || 0)).toLocaleString('en-US'); }
  /* Fixed places, then trailing zeros dropped: 6.83, 42, 4.5 — not 4.50.
     The previous trim only caught ".0", which left every x.y0 diameter with a
     dead zero on a line where every other figure is exact. */
  function num(v, d) {
    var n = +v;
    return isFinite(n) ? String(+n.toFixed(d == null ? 1 : d)) : '';
  }
  function band(score) { return score >= 70 ? 'strong' : score >= 50 ? 'fair' : 'weak'; }
  function today() {
    var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  /* WHO YOU WILL BE CALLING.
     The operator is written on whichever feature the site team happened to
     label, and that is not always the top-voltage line: ATLAS LINK names OGE
     on its 69 kV line and on the substation while both 138 kV lines are bare,
     and BASIN SERVER names Big Country on the substation. Reading only the
     line at maxKv leaves the utility column blank on real files.

     Preference is still highest-voltage-first, because on a parcel touched by
     two utilities the one that owns the interconnecting voltage is the one the
     conversation is with. */
  function utilityOf(k) {
    var i, L;
    var lines = k.transmission || [], subs = k.substations || [];
    for (i = 0; i < lines.length; i++) {
      L = lines[i];
      if (L.attrs && L.attrs.kv === k.maxKv && L.attrs.owner) return L.attrs.owner;
    }
    for (i = 0; i < subs.length; i++) {
      L = subs[i];
      if (L.attrs && L.attrs.owner && L.attrs.kv === k.maxSubKv) return L.attrs.owner;
    }
    for (i = 0; i < subs.length; i++) if (subs[i].attrs && subs[i].attrs.owner) return subs[i].attrs.owner;
    for (i = 0; i < lines.length; i++) if (lines[i].attrs && lines[i].attrs.owner) return lines[i].attrs.owner;
    return '';
  }

  /* ── one record's fact line ──────────────────────────────────────────── */
  function facts(r) {
    var g = r.grid, k = r.intake, out = [];
    function f(b, u) {
      out.push('<span><b>' + b + '</b>' + (u ? ' <span class="u">' + u + '</span>' : '') + '</span>');
    }

    var owner = utilityOf(k);
    /* An absence is not a fact, so it does not get the emphasis a fact gets. */
    if (g.kv) f(esc(g.kv) + ' kV', esc(owner));
    else out.push('<span class="u">voltage not labelled</span>');

    if (g.poiMi != null) f(g.poiMi.toFixed(2) + ' mi', 'to ' + esc(g.poiVia || 'interconnection'));

    /* Gross acreage, and the buildable figure beside it when a hazard corridor
       has taken a bite out of it — one without the other is misleading either
       way round. */
    if (k.grossAcres != null) {
      var acres = n0(k.grossAcres) + ' ac';
      if (g.buildableCeilingAcres != null && g.buildableCeilingAcres < Math.round(k.grossAcres))
        acres += ' → ' + n0(g.buildableCeilingAcres) + ' buildable';
      f(acres, '');
    }
    if (g.mwHostable != null) f('~' + n0(g.mwCeiling != null ? g.mwCeiling : g.mwHostable) + ' MW', 'hostable');

    var c = k.circuitsAtMaxKv || 0, s = (k.substations || []).length;
    f(String(c), (c === 1 ? 'circuit' : 'circuits') + ' · ' + s + (s === 1 ? ' sub' : ' subs'));

    if (k.maxGasDiameterIn && k.nearestGasM != null)
      f(num(k.maxGasDiameterIn, 2) + '″ gas', 'at ' + (k.nearestGasM / 1609.344).toFixed(2) + ' mi');

    var haz = (g.hazardOnParcel || 0) + (g.hazardAdjacent || 0);
    if (haz) f(String(haz) + ' hazardous‑liquid', g.hazardOnParcel ? 'on parcel' : 'adjacent');

    return '<div class="facts">' + out.join('') + '</div>';
  }

  /* ── the contribution bar and its key ────────────────────────────────── */
  function bars(g) {
    var segs = '', key = '', pen = '';
    (g.components || []).forEach(function (c) {
      if (c.key === 'hazard' || c.max <= 0) {
        if (c.points) pen = '<span class="pen">−' + Math.abs(c.points) + '</span>';
        return;
      }
      var v = 'var(' + (CVAR[c.key] || '--c5') + ')';
      var lbl = esc(c.key) + ' ' + num(c.points) + '/' + c.max;
      segs += '<i style="width:' + c.points + '%;background:' + v + '" title="' + lbl + '"></i>';
      key  += '<span><u style="background:' + v + '"></u>' + lbl + '</span>';
    });
    if (!segs) return '';
    return '<div class="bar">' + segs + '</div><div class="key">' + key + pen + '</div>';
  }

  /* ── every flag, in prose, plus the thin-file line ───────────────────── */
  function notes(r) {
    var out = [];
    (r.intake.flags || []).forEach(function (f) {
      out.push('<div class="note ' + esc(f.level || 'info') + '">' + esc(f.msg) + '</div>');
    });
    if ((r.grid.missing || []).length) {
      out.push('<div class="note info">Thin file — missing ' +
        esc(r.grid.missing.join(', ')) + '. The score is defensible but the evidence ' +
        'behind it is not complete.</div>');
    }
    return out.length ? '<div class="notes">' + out.join('') + '</div>' : '';
  }

  function record(r, i) {
    var g = r.grid, b = band(g.score);
    return '<div class="rec">' +
      '<div class="rank mono">' + (i + 1 < 10 ? '0' : '') + (i + 1) + '</div>' +
      '<div style="display:flex"><div class="band" style="background:var(--' + b + ')"></div>' +
      '<div class="body" style="flex:1;min-width:0">' +
        '<div class="line1">' +
          '<span class="nm">' + esc(r.name) + '</span>' +
          '<span class="sc s-' + b + '">' + g.score + '<small>/100</small></span>' +
          '<span class="conf ' + esc(g.confidence) + '">' + esc(g.confidence) + ' confidence</span>' +
        '</div>' +
        facts(r) + bars(g) + notes(r) +
      '</div></div></div>';
  }

  /* ── kV class → planning capacity, read off the engine ───────────────── */
  function classTable(rows) {
    var si = SI();
    var CLASSES = [500, 345, 230, 138, 115, 69];
    var body = '';
    CLASSES.forEach(function (kv) {
      var next = CLASSES[CLASSES.indexOf(kv) - 1] || Infinity;
      var here = rows.filter(function (r) {
        var v = r.grid.kv; return v != null && v >= kv && v < next;
      });
      if (!here.length) return;
      var best = here.slice().sort(function (a, b) { return b.grid.score - a.grid.score; })[0];
      var cap = si && si.mwCeilingFor ? si.mwCeilingFor(kv) : null;
      body += '<tr><td>' + kv + ' kV</td>' +
        '<td>' + (cap == null ? '—' : '~' + n0(cap) + ' MW') + '</td>' +
        '<td>' + here.length + '</td>' +
        '<td>' + esc(best.name) + ' <span class="mono s-' + band(best.grid.score) + '">' +
          best.grid.score + '</span></td></tr>';
    });
    if (!body) return '';
    return '<h2 class="sec" style="margin-top:32px">Voltage class → planning capacity</h2>' +
      '<div class="scroll"><table class="tbl">' +
      '<thead><tr><th>Class</th><th>Deliverable load, single POI</th><th>Sites here</th>' +
      '<th>Best of them</th></tr></thead><tbody>' + body + '</tbody></table></div>' +
      '<p style="font-size:12px;color:var(--mute);margin-top:9px;max-width:78ch">Planning ' +
      'heuristics for ranking and for sanity-checking acreage against service. They are not ' +
      'thermal ratings, not available transfer capability, and not a capacity commitment ' +
      'from anybody.</p>';
  }

  function methodGrid() {
    var si = SI(), W = (si && si.WEIGHTS) || {};
    var order = ['voltage', 'distance', 'redundancy', 'land', 'gas'];
    var cells = order.map(function (k) {
      if (W[k] == null) return '';
      return '<div class="m"><h4><u style="background:var(' + (CVAR[k] || '--c5') + ')"></u>' +
        LABEL[k] + '<span class="w">' + W[k] + ' pts</span></h4><p>' + WHY[k] + '</p></div>';
    }).join('');
    cells += '<div class="m"><h4 style="color:var(--weak)"><u style="background:var(--weak)"></u>' +
      'Hazard<span class="w">&minus;18 max</span></h4><p>Crude and highly volatile liquid ' +
      'lines are a setback and a construction risk, not fuel. Applied after the components, ' +
      'and capped: a pipeline corridor is a cost and a schedule item, never a ' +
      'disqualification on its own.</p></div>';
    return '<h2 class="sec">How the number is built</h2><div class="mgrid">' + cells + '</div>';
  }

  /* ── the document ────────────────────────────────────────────────────── */
  function html(rows, opts) {
    opts = opts || {};
    rows = (rows || []).slice().sort(function (a, b) { return b.grid.score - a.grid.score; });

    var si = SI();
    var n     = rows.length;
    var hi    = rows.filter(function (r) { return r.grid.score >= 70; }).length;
    var ehv   = rows.filter(function (r) { return r.grid.kv >= 345; }).length;
    var acres = rows.reduce(function (a, r) { return a + (r.intake.grossAcres || 0); }, 0);
    var mw    = rows.reduce(function (a, r) { return a + (r.grid.mwHostable || 0); }, 0);
    var flagged = rows.filter(function (r) { return (r.intake.flags || []).length; }).length;

    function countFlag(code) {
      return rows.filter(function (r) {
        return (r.intake.flags || []).some(function (f) { return f.code === code; });
      }).length;
    }
    var disc = countFlag('acreage_discrepancy'), unlab = countFlag('sub_voltage_unknown');

    var strip = [
      [n, 'parcels screened'],
      [hi, 'scoring 70+'],
      [ehv, 'on 345&nbsp;kV'],
      [n0(acres), 'gross acres'],
      [(mw / 1000).toFixed(1) + '<small style="font-size:13px"> GW</small>', 'hostable, grid-limited'],
      [flagged, 'carrying a flag']
    ].map(function (c) {
      return '<div class="cell"><div class="n">' + c[0] + '</div><div class="l">' + c[1] + '</div></div>';
    }).join('');

    var foot = 'Generated by <span class="mono">omega-site-intel.js</span> from the parcel ' +
      'KMZ files, with no manual entry. Acreage takes the lower of the figure written on the ' +
      'drawing and the figure the drawn polygon measures whenever the two disagree by more ' +
      'than 5%' + (disc ? '; ' + disc + (disc === 1 ? ' parcel here does' : ' parcels here do') : '') +
      '. Substations labelled without a voltage are scored conservatively' +
      (unlab ? ' — ' + unlab + ' of these files would move on a one-word edit to the KMZ' : '') +
      '.';

    return '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>' + esc(opts.title || 'Parcel Screening Register') + '</title>' +
      '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=IBM+Plex+Mono:wght@400;500;600&family=Source+Sans+3:ital,wght@0,400;0,600;1,400&display=swap">' +
      '<style>' + CSS + '</style></head><body><div class="wrap">' +
      '<div class="mast">' +
        '<div class="eyebrow">' + esc(opts.brand || 'ClearSky · OMEGA') +
          ' &nbsp;/&nbsp; Site Intelligence</div>' +
        '<h1>Parcel Screening<br>Register</h1>' +
        '<p class="sub">' + esc(opts.subtitle || (n + (n === 1 ? ' parcel' : ' parcels') +
          ' screened for grid interconnection straight from the Google Earth files the site ' +
          'team already drew.')) + '</p>' +
        '<div class="meta">' +
          '<span>RUN <b>' + today() + '</b></span>' +
          '<span>ENGINE <b>' + esc((si && si.VERSION) || 'site-intel') + '</b></span>' +
          '<span>SOURCE <b>' + n + ' KMZ, traced</b></span>' +
          '<span>EVIDENCE <b>kmz_traced</b></span>' +
        '</div>' +
      '</div>' +
      '<div class="caveat"><h3>This ranks sites. It does not clear one.</h3>' +
        '<p>Every figure below is measured off a line somebody drew by eye over imagery. The ' +
        'engine cannot see queue position, thermal ratings, ATC, or curtailment history ' +
        '&mdash; so a 345&nbsp;kV line on the fence with a full interconnection queue behind ' +
        'it scores well here and is undevelopable. Capacity figures are planning heuristics ' +
        'keyed to voltage class, not utility data.</p>' +
        '<p>Read it as a work order: it says which parcels earn a utility conversation first, ' +
        'and which questions to bring. Confidence and the per-component breakdown are shown ' +
        'on every record so you can see what earned the number and how thin the file behind ' +
        'it is.</p></div>' +
      '<div class="strip">' + strip + '</div>' +
      '<h2 class="sec">Ranked &mdash; strongest grid position first</h2>' +
      '<div class="reg">' + rows.map(record).join('') + '</div>' +
      '<div class="method">' + methodGrid() + classTable(rows) + '</div>' +
      '<div class="foot">' + foot + '</div>' +
      '</div></body></html>';
  }

  /* A blob URL, not document.write into an opened window: the editor is
     served with X-Frame-Options SAMEORIGIN and a CSP, and writing into
     about:blank inherits the opener's policy, which blocks the webfont. */
  function open(rows, opts) {
    var doc = html(rows, opts);
    var url = URL.createObjectURL(new Blob([doc], { type: 'text/html' }));
    var w = global.open(url, '_blank');
    if (!w) { URL.revokeObjectURL(url); throw new Error('The browser blocked the report window. Allow pop-ups for this site.'); }
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
    return w;
  }

  function print(rows, opts) {
    var w = open(rows, opts);
    /* The window prints itself once its own fonts have settled; calling
       print() from here races the stylesheet and lands on a page set in the
       fallback face. */
    try {
      w.addEventListener('load', function () {
        setTimeout(function () { try { w.print(); } catch (e) {} }, 400);
      });
    } catch (e) {}
    return w;
  }

  var CSS = [
    ':root{--paper:#F5F6F7;--surface:#FFFFFF;--sunk:#EDEFF1;--ink:#18222C;--body:#3D4B57;',
      '--mute:#6B7A87;--rule:#D9DEE3;--hair:#E7EBEE;--copper:#A85D3A;--copper-soft:#EFE0D8;',
      '--strong:#2E7355;--fair:#8E6B18;--weak:#A34A38;--strong-bg:#E2EFE8;--fair-bg:#F4ECD8;',
      '--weak-bg:#F5E2DE;--c1:#8C5A3C;--c2:#4A6E86;--c3:#6E7F5A;--c4:#8A7355;--c5:#5D6B78}',
    '@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){',
      '--paper:#11171D;--surface:#171F27;--sunk:#1D262F;--ink:#E7ECF1;--body:#B7C3CD;',
      '--mute:#84929E;--rule:#2B3743;--hair:#232D37;--copper:#D08657;--copper-soft:#33241C;',
      '--strong:#5FBB8E;--fair:#D0A63F;--weak:#DE7C66;--strong-bg:#16291F;--fair-bg:#2A2415;',
      '--weak-bg:#2C1B18;--c1:#C08054;--c2:#6E9CBB;--c3:#94AB7A;--c4:#BBA079;--c5:#8394A2}}',
    ':root[data-theme="dark"]{--paper:#11171D;--surface:#171F27;--sunk:#1D262F;--ink:#E7ECF1;',
      '--body:#B7C3CD;--mute:#84929E;--rule:#2B3743;--hair:#232D37;--copper:#D08657;',
      '--copper-soft:#33241C;--strong:#5FBB8E;--fair:#D0A63F;--weak:#DE7C66;',
      '--strong-bg:#16291F;--fair-bg:#2A2415;--weak-bg:#2C1B18;--c1:#C08054;--c2:#6E9CBB;',
      '--c3:#94AB7A;--c4:#BBA079;--c5:#8394A2}',
    '*{box-sizing:border-box}',
    'body{background:var(--paper);color:var(--body);font-family:"Source Sans 3",system-ui,',
      '-apple-system,sans-serif;font-size:15px;line-height:1.55;margin:0;-webkit-font-smoothing:antialiased}',
    '.wrap{max-width:1080px;margin:0 auto;padding:38px 24px 72px}',
    'h1,h2,h3,.disp{font-family:"Barlow Condensed","Arial Narrow",sans-serif;color:var(--ink);',
      'text-wrap:balance;margin:0;letter-spacing:.005em}',
    '.mono{font-family:"IBM Plex Mono",ui-monospace,monospace;font-variant-numeric:tabular-nums}',
    '.mast{border-bottom:2px solid var(--ink);padding-bottom:16px;margin-bottom:8px}',
    '.eyebrow{font-family:"IBM Plex Mono",monospace;font-size:10.5px;letter-spacing:.14em;',
      'text-transform:uppercase;color:var(--copper);font-weight:500}',
    'h1{font-size:clamp(36px,6.4vw,58px);font-weight:700;line-height:.95;text-transform:uppercase;margin:10px 0 0}',
    '.sub{font-size:16.5px;color:var(--mute);max-width:60ch;margin-top:10px}',
    '.meta{display:flex;flex-wrap:wrap;gap:6px 22px;margin-top:14px;',
      'font-family:"IBM Plex Mono",monospace;font-size:11px;color:var(--mute)}',
    '.meta b{color:var(--ink);font-weight:500}',
    '.caveat{background:var(--copper-soft);border-left:3px solid var(--copper);',
      'padding:16px 18px;margin:26px 0 34px;border-radius:0 3px 3px 0}',
    '.caveat h3{font-size:15px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;',
      'color:var(--copper);margin-bottom:6px}',
    '.caveat p{margin:0;font-size:14px;max-width:72ch;color:var(--body)}',
    '.caveat p + p{margin-top:8px}',
    '.strip{display:grid;grid-template-columns:repeat(auto-fit,minmax(132px,1fr));gap:1px;',
      'background:var(--rule);border:1px solid var(--rule);margin-bottom:34px}',
    '.cell{background:var(--surface);padding:13px 15px}',
    '.cell .n{font-family:"IBM Plex Mono",monospace;font-size:25px;font-weight:500;',
      'color:var(--ink);font-variant-numeric:tabular-nums;line-height:1.1}',
    '.cell .l{font-size:11px;color:var(--mute);margin-top:3px;line-height:1.35}',
    'h2.sec{font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:.11em;',
      'color:var(--mute);padding-bottom:7px;border-bottom:1px solid var(--rule);margin-bottom:0}',
    '.reg{display:flex;flex-direction:column}',
    '.rec{display:grid;grid-template-columns:34px 1fr;gap:0;border-bottom:1px solid var(--hair);',
      'background:var(--surface);break-inside:avoid;page-break-inside:avoid}',
    '.rank{display:flex;align-items:flex-start;justify-content:center;padding:15px 0 0;',
      'font-family:"IBM Plex Mono",monospace;font-size:11px;color:var(--mute);',
      'border-right:1px solid var(--hair)}',
    '.band{width:3px}',
    '.body{padding:14px 16px 16px}',
    '.line1{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap}',
    '.nm{font-family:"Barlow Condensed",sans-serif;font-size:24px;font-weight:600;',
      'text-transform:uppercase;color:var(--ink);line-height:1}',
    '.sc{font-family:"IBM Plex Mono",monospace;font-size:22px;font-weight:600;line-height:1;',
      'font-variant-numeric:tabular-nums}',
    '.sc small{font-size:10.5px;font-weight:400;color:var(--mute);letter-spacing:.03em}',
    '.conf{font-family:"IBM Plex Mono",monospace;font-size:9.5px;letter-spacing:.09em;',
      'text-transform:uppercase;padding:2.5px 7px;border-radius:2px;font-weight:500}',
    '.conf.good{background:var(--strong-bg);color:var(--strong)}',
    '.conf.medium{background:var(--fair-bg);color:var(--fair)}',
    '.conf.low{background:var(--weak-bg);color:var(--weak)}',
    '.s-strong{color:var(--strong)}.s-fair{color:var(--fair)}.s-weak{color:var(--weak)}',
    '.facts{display:flex;flex-wrap:wrap;gap:3px 20px;margin-top:9px;',
      'font-family:"IBM Plex Mono",monospace;font-size:11.5px;color:var(--mute)}',
    '.facts b{color:var(--ink);font-weight:500}',
    '.facts .u{color:var(--body);font-weight:400}',
    '.bar{display:flex;height:7px;margin-top:11px;background:var(--sunk);border-radius:1px;overflow:hidden}',
    '.bar i{display:block;height:100%}',
    '.key{display:flex;flex-wrap:wrap;gap:4px 15px;margin-top:7px;',
      'font-family:"IBM Plex Mono",monospace;font-size:10px;color:var(--mute)}',
    '.key span{display:flex;align-items:center;gap:5px;white-space:nowrap}',
    '.key u{width:7px;height:7px;border-radius:1px;display:inline-block;text-decoration:none}',
    '.pen{color:var(--weak)}',
    '.notes{margin-top:11px;display:flex;flex-direction:column;gap:5px}',
    '.note{font-size:12.5px;line-height:1.45;padding-left:12px;position:relative;max-width:88ch}',
    '.note::before{content:"";position:absolute;left:0;top:.52em;width:4px;height:4px;border-radius:50%}',
    '.note.warn{color:var(--body)}.note.warn::before{background:var(--fair)}',
    '.note.info{color:var(--mute)}.note.info::before{background:var(--mute)}',
    '.note.error{color:var(--body)}.note.error::before{background:var(--weak)}',
    '.method{margin-top:44px;border-top:2px solid var(--ink);padding-top:22px}',
    '.mgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:22px;margin-top:16px}',
    '.m h4{font-family:"Barlow Condensed",sans-serif;font-size:17px;font-weight:600;',
      'text-transform:uppercase;color:var(--ink);margin:0 0 4px;display:flex;align-items:center;gap:7px}',
    '.m h4 u{width:8px;height:8px;border-radius:1px;text-decoration:none;flex:none}',
    '.m .w{font-family:"IBM Plex Mono",monospace;font-size:10.5px;color:var(--mute);',
      'margin-left:auto;font-weight:400}',
    '.m p{font-size:13px;margin:0;color:var(--mute);line-height:1.5}',
    '.tbl{width:100%;border-collapse:collapse;margin-top:14px;font-size:12.5px}',
    '.tbl th{font-family:"IBM Plex Mono",monospace;font-size:9.5px;letter-spacing:.09em;',
      'text-transform:uppercase;color:var(--mute);text-align:left;font-weight:500;',
      'padding:0 12px 6px 0;border-bottom:1px solid var(--rule)}',
    '.tbl td{padding:6px 12px 6px 0;border-bottom:1px solid var(--hair);color:var(--body)}',
    '.tbl td:first-child{font-family:"IBM Plex Mono",monospace;color:var(--ink);white-space:nowrap}',
    '.scroll{overflow-x:auto}',
    '.foot{margin-top:34px;padding-top:16px;border-top:1px solid var(--rule);font-size:12px;',
      'color:var(--mute);max-width:78ch}',
    '@media (max-width:640px){.rec{grid-template-columns:22px 1fr}.body{padding:12px 12px 14px}.nm{font-size:20px}}',
    /* Print: the bars and the confidence chips ARE the information, so the
       colour has to survive the trip to PDF. */
    '@page{margin:12mm}',
    '@media print{:root{--paper:#fff}body{background:#fff}.wrap{padding:0}',
      '*{-webkit-print-color-adjust:exact;print-color-adjust:exact}',
      '.method,.foot{break-before:auto}}',
    '@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}'
  ].join('');

  global.OmegaParcelReport = {
    html: html, open: open, print: print, VERSION: VERSION
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = global.OmegaParcelReport;

})(typeof window !== 'undefined' ? window : globalThis);
