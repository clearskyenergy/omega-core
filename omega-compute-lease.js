/* ═══════════════════════════════════════════════════════════════════════════
   omega-compute-lease.js — one client for /api/compute-lease
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   WHY THIS FILE EXISTS.

   omega-grid-atlas-client.js already made this argument and it applies twice
   over here: two copies of one thing disagree within a month, and the
   disagreement surfaces as two different answers for one site with nobody
   able to say which is right.

   There are now two surfaces that screen a compute site and print a land
   lease proposal — compute-proposal.html, and the editor's Compute panel —
   and a third will want it before long. What they share is not just the call
   to /api/compute-lease. It is:

     · the FAN-OUT. Grid Atlas, Network Proximity and the parcel record, in
       parallel, each independently failable, each reporting separately.
     · the PROPOSAL. Four pages of host-facing document. If the editor's copy
       and the tool's copy drift, two hosts get two different offers from the
       same company in the same week.

   Both are here, once.

   ── WHAT THE MODEL IS, AND IS NOT ──────────────────────────────────────
   Nothing in this file scores anything or prices anything. The four gates,
   the tranche rule and the lease rate card are in /api/compute-lease.js and
   they stay there — see CLAUDE.md's IP rule. This file gathers evidence,
   posts it, and renders what comes back. If you find yourself adding a
   number here, it belongs in the function.

   ── WHY THE CLIENT FANS OUT AND THE FUNCTION DOES NOT ──────────────────
   /api/network-proximity is time-boxed at 55 s against six external sources,
   under the 60 s serverless ceiling. Nested inside another function that puts
   two timeouts in series under one ceiling: the outer one dies first and the
   rep is told nothing rather than told about the two gates that did answer.
   So the three lookups run from here, in parallel, and the evidence is posted
   to the model. Each gate fills in as its source lands, which is also the
   better thing to watch.

   ── CONSOLE ────────────────────────────────────────────────────────────
     OmegaComputeLease.screen({lat, lng, address}, rep, {onSource})
     OmegaComputeLease.rescore(evidence, rep)        // no lookups re-run
     OmegaComputeLease.openProposal(result, {host, rep, term, present})
   ═══════════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  if (root.OmegaComputeLease) return;

  var ENDPOINT = '/api/compute-lease';

  /* ── AUTH ───────────────────────────────────────────────────────────────
     /api/compute-lease, /api/network-proximity and /api/parcel all require
     the signed-in user's ID token. Grid Atlas does not. A missing token is
     reported as "sign in", never as a 401 nobody can interpret. */
  function idToken() {
    var u = null;
    try {
      u = root._currentUser
        || (root.firebase && root.firebase.auth && root.firebase.auth().currentUser);
    } catch (e) {}
    if (!u || typeof u.getIdToken !== 'function') return Promise.resolve(null);
    return u.getIdToken().then(null, function () { return null; });
  }

  /* Progress, per source. The caller passes onSource(key, state, text) and
     decides how to show it — a status line in the tool, a row in the editor's
     modal. Nothing here touches the DOM. */
  function report(opts, key, state, text) {
    if (!opts || typeof opts.onSource !== 'function') return;
    try { opts.onSource(key, state, text); } catch (e) {}
  }

  function round(v, d) { var m = Math.pow(10, d || 0); return Math.round(v * m) / m; }

  /* ── THE THREE EVIDENCE LOOKUPS ─────────────────────────────────────────
     A layer that does not answer is MISSING, not zero. /api/compute-lease
     drops it out of the gate rather than counting it against the site, and
     says so in `findings`. That is the same distinction api/grid-atlas.js
     makes for a layer that failed, and it is the whole reason the gates can
     be trusted: "we could not check" is not a finding about the site. */
  function lookupGrid(site, opts) {
    var GA = root.OmegaGridAtlas;
    if (!GA || !GA.run) {
      report(opts, 'grid', 'warn', 'the Grid Atlas client did not load');
      return Promise.resolve(null);
    }
    report(opts, 'grid', 'busy', 'measuring…');
    return GA.run({ lat: site.lat, lng: site.lng, address: site.address, sizeMw: site.sizeMw || 1 })
      .then(function (j) {
        /* Grid Atlas geocodes. When the caller had no coordinates this is
           where the site gets them, and the two lookups below depend on it. */
        if (j.lat != null) { site.lat = j.lat; site.lng = j.lng; }
        site.resolved = j.resolvedAddress || site.address;
        var s = (GA.summarise && GA.summarise(j)) || {};
        report(opts, 'grid', 'ok', (s.nearestSubKm != null
          ? 'substation ' + round(s.nearestSubKm, 1) + ' km'
            + (s.maxKv ? ' · ' + s.maxKv + ' kV' : '')
          : 'no substation in range')
          + ' · ' + (s.score == null ? 'unscored' : s.score + '/100'));
        return { score: s.score, nearestSubKm: s.nearestSubKm, nearestSubName: s.nearestSubName,
                 maxKv: s.maxKv, resolvedAddress: j.resolvedAddress, geocode: j.geocode || null };
      })['catch'](function (e) {
        report(opts, 'grid', 'warn', (e && e.message) || 'did not answer');
        return null;
      });
  }

  function lookupFiber(site, tok, opts) {
    var GA = root.OmegaGridAtlas;
    if (!tok) { report(opts, 'fiber', 'warn', 'sign in to run the fiber lookup'); return Promise.resolve(null); }
    if (!GA || !GA.network) { report(opts, 'fiber', 'warn', 'the Grid Atlas client did not load'); return Promise.resolve(null); }
    report(opts, 'fiber', 'busy', 'asking six sources, up to 55 s…');
    return GA.network({ lat: site.lat, lng: site.lng }, { requestedCapacityGbps: 1, timeoutMs: 55000 })
      .then(function (j) {
        var f = j.fiber || {};
        report(opts, 'fiber',
          f.verdict === 'unlikely' ? 'bad' : f.verdict === 'likely' ? 'ok' : 'warn',
          'fiber ' + (f.verdict || 'unknown')
          + (f.lateral && f.lateral.mi != null ? ' · nearest evidence ' + f.lateral.mi + ' mi' : ''));
        return { verdict: f.verdict || null, score: f.score == null ? null : f.score,
                 reasons: f.reasons || [], lateral: f.lateral || null, dataReady: !!f.dataReady };
      })['catch'](function (e) {
        report(opts, 'fiber', 'warn', (e && e.message) || 'did not answer');
        return null;
      });
  }

  function lookupParcel(site, tok, opts) {
    if (!tok) { report(opts, 'parcel', 'warn', 'sign in to read the parcel'); return Promise.resolve(null); }
    report(opts, 'parcel', 'busy', 'reading the county layer…');
    return fetch('/api/parcel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok },
      body: JSON.stringify({ lat: site.lat, lng: site.lng })
    }).then(function (r) { return r.json()['catch'](function () { return {}; }); })
      .then(function (j) {
        if (!j || j.ok === false) {
          report(opts, 'parcel', 'warn', (j && j.reason) || 'no parcel record here');
          return (j && j.ok === false) ? j : null;
        }
        report(opts, 'parcel', 'ok',
          (j.zoning ? 'zoned ' + j.zoning : 'no zoning published')
          + (j.acres != null ? ' · ' + round(j.acres, 2) + ' ac' : '')
          + (j.owner ? ' · ' + j.owner : ''));
        return j;
      })['catch'](function (e) {
        report(opts, 'parcel', 'warn', (e && e.message) || 'did not answer');
        return null;
      });
  }

  /* Gather all three. Resolves { gridAtlas, network, parcel, site } — never
     rejects on a single source, because two gates answered is worth more than
     a clean error. */
  function evidence(site, opts) {
    opts = opts || {};
    var s = { lat: site && site.lat != null ? +site.lat : null,
              lng: site && site.lng != null ? +site.lng
                 : (site && site.lon != null ? +site.lon : null),
              address: (site && site.address) || '',
              sizeMw: site && site.sizeMw != null ? +site.sizeMw : 1,
              resolved: '' };
    if (s.lat == null && !s.address)
      return Promise.reject(new Error('No coordinates and no address — nothing to screen.'));

    report(opts, 'geocode', 'busy', 'locating…');
    return lookupGrid(s, opts).then(function (ga) {
      if (s.lat == null) report(opts, 'geocode', 'bad',
        'could not be located — the gates will rest on your answers alone');
      else report(opts, 'geocode', 'ok', s.resolved || s.address);
      return idToken().then(function (tok) {
        return Promise.all([
          s.lat == null ? Promise.resolve(null) : lookupFiber(s, tok, opts),
          s.lat == null ? Promise.resolve(null) : lookupParcel(s, tok, opts)
        ]).then(function (parts) {
          return { gridAtlas: ga, network: parts[0], parcel: parts[1], site: s };
        });
      });
    });
  }

  /* ── SCORE ──────────────────────────────────────────────────────────────
     Post the evidence and the rep's answers. Everything that decides anything
     happens on the other side of this call. */
  function rescore(ev, rep, opts) {
    opts = opts || {};
    report(opts, 'score', 'busy', 'running the gate set…');
    return idToken().then(function (tok) {
      if (!tok) throw new Error('Sign in — the gate model and the rate card are behind your account.');
      return fetch(opts.url || ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok },
        body: JSON.stringify({ rep: rep || {}, evidence: ev || {} })
      });
    }).then(function (r) {
      return r.json()['catch'](function () { return {}; }).then(function (j) {
        if (!r.ok) throw new Error((j && (j.error || j.detail)) || (ENDPOINT + ' returned ' + r.status));
        if (!j || !j.gates) throw new Error('The compute lease service answered with nothing usable.');
        return j;
      });
    }).then(function (j) {
      report(opts, 'score', j.verdict === 'disqualified' ? 'bad' : j.verdict === 'qualified' ? 'ok' : 'warn',
        j.verdict + ' · ' + (j.offer ? money(j.offer.monthly.base) + '/mo at base' : 'no offer priced'));
      return j;
    })['catch'](function (e) {
      report(opts, 'score', 'bad', (e && e.message) || 'failed');
      throw e;
    });
  }

  /* Evidence + score in one call, which is what both surfaces actually want.
     Resolves { result, evidence } so the caller can keep the evidence and
     re-score against it as the rep fills answers in — editing an answer must
     never re-run a 55-second fiber lookup. */
  function screen(site, rep, opts) {
    return evidence(site, opts).then(function (ev) {
      var r = Object.assign ? Object.assign({}, rep || {}) : shallow(rep);
      if (r.address == null || r.address === '') r.address = ev.site.resolved || ev.site.address;
      if (r.lat == null) r.lat = ev.site.lat;
      if (r.lng == null) r.lng = ev.site.lng;
      return rescore(ev, r, opts).then(function (result) {
        return { result: result, evidence: ev, rep: r };
      });
    });
  }
  function shallow(o) { var x = {}, k; for (k in o) if (o.hasOwnProperty(k)) x[k] = o[k]; return x; }

  /* ═════════════════════════════════════════════════════════════════════════
     THE PROPOSAL
     ═════════════════════════════════════════════════════════════════════════
     Four pages, host-facing, and deliberately a different document from the
     screen a rep reads. The host sees the offer, the term, what we bring and
     what we need from them. They do not see gate scores, the ask list or the
     rate card version — those are ours.

     ── BRANDING ──────────────────────────────────────────────────────────
     `result.brand` comes back from /api/compute-lease, read from the caller's
     own omega_orgs record. It is the tenant's company, not ClearSky's: a
     SunESol rep sends a SunESol proposal. Resolved server-side precisely so
     the two surfaces cannot disagree about it.

     A logo is drawn on a white chip on the dark cover and footers. That is
     not decoration — sales-proposal.html carries a long note about exactly
     this: a mark that is black-on-transparent vanishes on a navy footer, and
     the export looks fine on screen and ships with an invisible logo. A white
     chip works for every mark without needing a second white-variant file.
     ═════════════════════════════════════════════════════════════════════════ */

  var FALLBACK_BRAND = { name: 'ClearSky Energy Solutions', logoUrl: '', accent: '#1D4ED8', tagline: '' };

  function brandOf(result, override) {
    var b = (result && result.brand) || {};
    var o = override || {};
    return {
      name: o.name || b.name || FALLBACK_BRAND.name,
      logoUrl: o.logoUrl || b.logoUrl || '',
      accent: o.accent || b.accent || FALLBACK_BRAND.accent,
      tagline: o.tagline || b.tagline || '',
      resolved: !!(o.name || b.name)
    };
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function money(n) {
    if (n == null || !isFinite(n)) return '—';
    return '$' + String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
  function moneyShort(n) {
    if (n == null || !isFinite(n)) return '—';
    if (n >= 1000000) return '$' + (Math.round(n / 100000) / 10) + 'M';
    if (n >= 10000) return '$' + Math.round(n / 1000) + 'k';
    return money(n);
  }
  function acresPhrase(n) { return n + ' ' + (Number(n) === 1 ? 'acre' : 'acres'); }

  /* What goes on the host's page. The DEFAULT is the opening number alone.

     The band is three positions in a negotiation, not three estimates of the
     site, and printing low–high hands the host the ceiling before anyone has
     said anything — after which there is no version of the conversation that
     ends below it. `full` exists for an internal review copy and the surfaces
     label it as such; it is never the default. */
  function rentPhrase(o, mode) {
    if (!o) return null;
    mode = mode || 'base';
    if (mode === 'open') return { num: money(o.monthly.low), unit: 'per month',
      yr: money(o.annual.low) + ' per year', total: o.termTotal.low, totalHi: o.termTotal.low };
    if (mode === 'range') return { num: money(o.monthly.low) + '–' + money(o.monthly.base), unit: 'per month',
      yr: money(o.annual.low) + '–' + money(o.annual.base) + ' per year', total: o.termTotal.low, totalHi: o.termTotal.base };
    if (mode === 'full') return { num: money(o.monthly.low) + '–' + money(o.monthly.high), unit: 'per month',
      yr: money(o.annual.low) + '–' + money(o.annual.high) + ' per year', total: o.termTotal.low, totalHi: o.termTotal.high };
    return { num: money(o.monthly.base), unit: 'per month',
      yr: money(o.annual.base) + ' per year', total: o.termTotal.base, totalHi: o.termTotal.base };
  }

  /* The host's version of the caveat. /api/compute-lease's own `disclaimer`
     says the same thing but names the rate card by version — provenance for
     the rep, noise on the host's copy. The screen prints that one; the
     proposal prints this one. Both say the document is indicative. */
  var HOST_DISCLAIMER = 'This is an indicative proposal, not a binding offer. Rent, term and conditions '
    + 'are subject to a signed letter of intent, a utility will-serve confirmation, a carrier commitment '
    + 'for 1 Gbps bidirectional service, and site diligence.';

  function proposalCss(accent) {
    accent = accent || FALLBACK_BRAND.accent;
    return '.cl-page{width:816px;min-height:1056px;background:#fff;box-shadow:0 2px 16px rgba(15,27,42,.10);'
      + 'position:relative;overflow:hidden;flex:0 0 auto;color:#1E2A38;'
      + "font-family:'Inter',-apple-system,BlinkMacSystemFont,Arial,sans-serif}"
      + '.cl-p1{background:#0F1B2A;color:#fff;padding:54px 58px 40px;display:flex;flex-direction:column}'
      + '.cl-mark{display:flex;align-items:center;gap:11px;margin-bottom:auto}'
      + '.cl-mark img{width:46px;height:46px;object-fit:contain;background:#fff;border-radius:7px;padding:4px}'
      + '.cl-mark-n{font-size:15px;font-weight:800;letter-spacing:-.01em}'
      + '.cl-mark-t{font-size:8.5px;letter-spacing:.13em;text-transform:uppercase;color:rgba(255,255,255,.5);font-weight:700;margin-top:2px}'
      + '.cl-eyebrow{font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:rgba(255,255,255,.55);font-weight:700;margin-bottom:14px}'
      + '.cl-h1{font-size:43px;font-weight:800;line-height:1.1;letter-spacing:-.03em;margin:0 0 8px}'
      + '.cl-h1 span{color:#60A5FA}'
      + '.cl-lede{font-size:13.5px;line-height:1.7;color:rgba(255,255,255,.72);max-width:520px;margin-bottom:30px}'
      + '.cl-offer{border-top:1px solid rgba(255,255,255,.16);border-bottom:1px solid rgba(255,255,255,.16);padding:24px 0;margin-bottom:26px}'
      + '.cl-offer-l{font-size:9.5px;letter-spacing:.14em;text-transform:uppercase;color:rgba(255,255,255,.5);font-weight:700;margin-bottom:9px}'
      + '.cl-offer-n{font-size:48px;font-weight:800;letter-spacing:-.035em;line-height:1}'
      + '.cl-offer-u{font-size:13px;font-weight:600;color:rgba(255,255,255,.6);margin-top:8px}'
      + '.cl-meta{display:grid;grid-template-columns:1fr 1fr;gap:18px 30px;margin-bottom:auto}'
      + '.cl-meta label{display:block;font-size:8.5px;letter-spacing:.12em;text-transform:uppercase;color:rgba(255,255,255,.45);font-weight:700;margin-bottom:4px}'
      + '.cl-meta span{font-size:12.5px;font-weight:600}'
      + '.cl-p1-f{display:flex;justify-content:space-between;font-size:8.5px;letter-spacing:.09em;text-transform:uppercase;color:rgba(255,255,255,.4);font-weight:700;padding-top:24px}'
      + '.cl-ph{background:#0F1B2A;color:#fff;padding:14px 44px;display:flex;align-items:center;justify-content:space-between}'
      + '.cl-ph-b{display:flex;align-items:center;gap:9px;font-size:12px;font-weight:800}'
      + '.cl-ph-b img{width:26px;height:26px;object-fit:contain;background:#fff;border-radius:5px;padding:2px}'
      + '.cl-ph-t{font-size:9px;letter-spacing:.13em;text-transform:uppercase;color:rgba(255,255,255,.62);font-weight:700}'
      + '.cl-pb{padding:30px 44px 70px}'
      + '.cl-pt{font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:' + accent + ';font-weight:800;margin-bottom:11px;padding-bottom:6px;border-bottom:1px solid #E2E8F0}'
      + '.cl-pp{font-size:12px;line-height:1.75;color:#334155;margin-bottom:15px}'
      + '.cl-pf{position:absolute;bottom:0;left:0;right:0;background:#0F1B2A;color:rgba(255,255,255,.55);padding:11px 44px;display:flex;justify-content:space-between;font-size:8.5px;letter-spacing:.05em}'
      + '.cl-tbl{width:100%;border-collapse:collapse;margin-bottom:16px}'
      + '.cl-tbl th{text-align:left;font-size:8.5px;letter-spacing:.1em;text-transform:uppercase;color:#64748B;font-weight:800;padding:8px 10px;border-bottom:1px solid #E2E8F0}'
      + '.cl-tbl td{font-size:11.5px;padding:10px;border-bottom:1px solid #E2E8F0;vertical-align:top;line-height:1.55;color:#334155}'
      + '.cl-tbl td.g{font-weight:700;color:#0F1B2A;width:112px}'
      + '.cl-pill{display:inline-block;font-size:8.5px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;padding:3px 8px;border-radius:4px}'
      + '.cl-pill-pass{background:rgba(22,163,74,.10);color:#16A34A}'
      + '.cl-pill-conditional{background:rgba(180,83,9,.10);color:#B45309}'
      + '.cl-pill-unconfirmed{background:rgba(100,116,139,.10);color:#64748B}'
      + '.cl-pill-fail{background:rgba(220,38,38,.09);color:#DC2626}'
      + '.cl-econ{display:grid;grid-template-columns:repeat(3,1fr);gap:13px;margin-bottom:18px}'
      + '.cl-econ-b{border:1px solid #E2E8F0;border-radius:9px;padding:15px;text-align:center}'
      + '.cl-econ-b.hero{border-color:' + accent + ';background:rgba(29,78,216,.06)}'
      + '.cl-econ-l{font-size:8.5px;letter-spacing:.1em;text-transform:uppercase;font-weight:800;color:#64748B;margin-bottom:7px}'
      + '.cl-econ-n{font-size:23px;font-weight:800;color:#0F1B2A;letter-spacing:-.03em;line-height:1.1}'
      + '.cl-econ-note{font-size:9.5px;color:#64748B;margin-top:6px;line-height:1.5}'
      + '.cl-split{display:grid;grid-template-columns:1fr 1fr;gap:22px;margin-bottom:16px}'
      + '.cl-split h4{font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:' + accent + ';font-weight:800;margin:0 0 8px}'
      + '.cl-split li{font-size:11.5px;line-height:1.75;color:#334155;margin-left:15px;margin-bottom:4px}'
      + '.cl-fine{font-size:9.5px;line-height:1.7;color:#64748B;padding:11px 13px;background:#F7F9FC;border-radius:7px;border:1px solid #E2E8F0}'
      + '.cl-step{display:flex;gap:14px;margin-bottom:15px}'
      + '.cl-step-n{width:26px;height:26px;border-radius:50%;background:' + accent + ';color:#fff;font-size:12px;font-weight:800;display:flex;align-items:center;justify-content:center;flex:0 0 auto}'
      + '.cl-step-t{font-size:12.5px;font-weight:700;color:#0F1B2A;margin-bottom:3px}'
      + '.cl-step-d{font-size:11px;line-height:1.7;color:#475569}'
      + '.cl-faq{margin-bottom:12px}'
      + '.cl-faq-q{font-size:11.5px;font-weight:700;color:#0F1B2A;margin-bottom:3px}'
      + '.cl-faq-a{font-size:11px;line-height:1.7;color:#475569}'
      + '@media print{@page{size:letter;margin:0}'
      + '.cl-page{width:8.5in;min-height:11in;box-shadow:none;page-break-after:always;break-after:page}'
      + '.cl-page:last-child{page-break-after:auto;break-after:auto}'
      + '*{-webkit-print-color-adjust:exact;print-color-adjust:exact}}';
  }

  function markCover(b) {
    return '<div class="cl-mark">'
      + (b.logoUrl ? '<img src="' + esc(b.logoUrl) + '" alt="" onerror="this.style.display=\'none\'">' : '')
      + '<div><div class="cl-mark-n">' + esc(b.name) + '</div>'
      + (b.tagline ? '<div class="cl-mark-t">' + esc(b.tagline) + '</div>' : '') + '</div></div>';
  }
  function pageHead(b, t) {
    return '<div class="cl-ph"><span class="cl-ph-b">'
      + (b.logoUrl ? '<img src="' + esc(b.logoUrl) + '" alt="" onerror="this.style.display=\'none\'">' : '')
      + esc(b.name) + '</span><span class="cl-ph-t">' + esc(t) + '</span></div>';
  }
  function pageFoot(l, r) {
    return '<div class="cl-pf"><span>' + esc(l) + '</span><span>' + esc(r) + '</span></div>';
  }
  function metaItem(l, v) { return '<div><label>' + esc(l) + '</label><span>' + esc(v) + '</span></div>'; }
  function kvRow(k, v) { return '<tr><td class="g">' + esc(k) + '</td><td colspan="2">' + esc(v) + '</td></tr>'; }
  function econ(l, n, note, hero) {
    return '<div class="cl-econ-b' + (hero ? ' hero' : '') + '"><div class="cl-econ-l">' + esc(l) + '</div>'
      + '<div class="cl-econ-n">' + esc(n) + '</div><div class="cl-econ-note">' + esc(note) + '</div></div>';
  }
  function step(n, t, d) {
    return '<div class="cl-step"><div class="cl-step-n">' + n + '</div>'
      + '<div><div class="cl-step-t">' + esc(t) + '</div><div class="cl-step-d">' + esc(d) + '</div></div></div>';
  }
  function faq(q, a) {
    return '<div class="cl-faq"><div class="cl-faq-q">' + esc(q) + '</div><div class="cl-faq-a">' + esc(a) + '</div></div>';
  }

  /* The four pages, as an HTML string. opts:
       host, contact, rep, repEmail   who it is for and from
       term                           override the offer's term (rare)
       present                        base | range | open | full
       brand                          override the tenant brand (rare) */
  function proposalPages(result, opts) {
    opts = opts || {};
    if (!result) return '';
    var b = brandOf(result, opts.brand);
    var o = result.offer;
    var rent = rentPhrase(o, opts.present || 'base');
    var host = opts.host || 'Site Host';
    var contact = opts.contact || '';
    var rep = opts.rep || '';
    var repEmail = opts.repEmail || '';
    var addr = (result.site && result.site.address) || opts.address || '—';
    var term = o ? o.termYears : (opts.term || 15);
    var today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    var docName = 'Land Lease Proposal · Distributed Compute';
    var p = [];

    /* ── PAGE 1 · COVER ── */
    p.push('<div class="cl-page cl-p1">'
      + markCover(b)
      + '<div class="cl-eyebrow">' + esc(docName) + '</div>'
      + '<h1 class="cl-h1">Your land.<br><span>Our equipment.</span><br>Your income.</h1>'
      + '<div class="cl-lede">We are looking for sites that already have power and fiber. '
      + 'We install and operate modular compute equipment on a small fenced pad, we pay for everything, '
      + 'and you receive rent for ' + term + ' years. No capital, no operating obligation, no change to '
      + 'your business.</div>'
      + (o
          ? '<div class="cl-offer"><div class="cl-offer-l">Indicative lease consideration</div>'
            + '<div class="cl-offer-n">' + esc(rent.num) + '</div>'
            + '<div class="cl-offer-u">' + esc(rent.unit) + ' &nbsp;·&nbsp; ' + esc(rent.yr)
            + ' &nbsp;·&nbsp; escalating annually over a ' + term + '-year term</div></div>'
          : '<div class="cl-offer"><div class="cl-offer-l">Lease consideration</div>'
            + '<div class="cl-offer-u" style="font-size:16px;color:rgba(255,255,255,.8)">'
            + 'To be established once the site qualification is complete.</div></div>')
      + '<div class="cl-meta">'
      + metaItem('Prepared for', host + (contact ? ' · ' + contact : ''))
      + metaItem('Site', addr)
      + metaItem('Prepared by', rep || b.name)
      + metaItem('Date', today)
      + '</div>'
      + '<div class="cl-p1-f"><span>' + esc(b.name) + '</span><span>' + esc(repEmail) + '</span></div>'
      + '</div>');

    /* ── PAGE 2 · SITE QUALIFICATION ── */
    var order = result.gateOrder || ['power', 'fiber', 'zoning', 'siteControl'];
    var hostWords = {
      power: 'We need roughly one megawatt of available power, with your utility confirming it will serve.',
      fiber: 'We need one gigabit per second of symmetric fiber. This is the requirement we cannot work around.',
      zoning: 'The area where the equipment sits needs to be zoned commercial or industrial.',
      siteControl: 'We need a ' + term + '-year lease or space use agreement with whoever controls the site.'
    };
    var rows = [];
    for (var i = 0; i < order.length; i++) {
      var g = result.gates[order[i]];
      if (!g) continue;
      rows.push('<tr><td class="g">' + esc(g.label) + '</td>'
        + '<td><span class="cl-pill cl-pill-' + esc(g.status) + '">'
        + esc(g.status === 'unconfirmed' ? 'to confirm' : g.status) + '</span></td>'
        + '<td>' + esc(hostWords[order[i]] || '') + '<br><span style="color:#64748B">'
        + esc(g.headline) + '</span></td></tr>');
    }
    p.push('<div class="cl-page">'
      + pageHead(b, 'Site Qualification')
      + '<div class="cl-pb">'
      + '<div class="cl-pt">What we are looking for, and where this site stands</div>'
      + '<div class="cl-pp">Every site we take forward has to clear four requirements. We screen them from '
      + 'public infrastructure data before we ask you for anything, so this is our read of your site as it '
      + 'stands today — not a questionnaire for you to fill in.</div>'
      + '<table class="cl-tbl"><thead><tr><th>Requirement</th><th>Status</th><th>What it means</th></tr></thead>'
      + '<tbody>' + rows.join('') + '</tbody></table>'
      + '<div class="cl-pt">The site</div>'
      + '<table class="cl-tbl"><tbody>'
      + kvRow('Address', addr)
      + (result.site && result.site.owner ? kvRow('Owner of record', result.site.owner) : '')
      + (result.site && result.site.apn
          ? kvRow('Parcel', result.site.apn + (result.site.county ? ' · ' + result.site.county : '')) : '')
      + (o ? kvRow('Area we would lease', acresPhrase(o.leasedAcres)
          + ' — pad, clearances, transformer and access') : '')
      + (o ? kvRow('Load we would contract', fmtInt(o.contractedKw) + ' kW') : '')
      + '</tbody></table>'
      + '<div class="cl-fine">' + esc(HOST_DISCLAIMER) + '</div>'
      + '</div>' + pageFoot(host, docName) + '</div>');

    /* ── PAGE 3 · THE LEASE ── */
    p.push('<div class="cl-page">'
      + pageHead(b, 'The Lease')
      + '<div class="cl-pb">'
      + '<div class="cl-pt">What you would receive</div>'
      + (o
        ? '<div class="cl-econ">'
          + econ('Per month', rent.num, 'Escalating annually', true)
          + econ('Per year', rent.yr.replace(' per year', ''), 'Year one', false)
          + econ('Over ' + term + ' years',
                 rent.total === rent.totalHi ? moneyShort(rent.total)
                   : moneyShort(rent.total) + '–' + moneyShort(rent.totalHi),
                 'Total consideration including escalation', false)
          + '</div>'
        : '<div class="cl-pp">The lease consideration is established once site qualification is complete. '
          + 'Nothing on this page is a commitment until then.</div>')
      + '<div class="cl-split">'
      + '<div><h4>' + esc(b.name) + ' pays for</h4><ul>'
      + '<li>All equipment and its installation</li>'
      + '<li>The electrical interconnection and any utility upgrade</li>'
      + '<li>Bringing fiber to the pad, if it is not already there</li>'
      + '<li>The power the equipment consumes — on our own meter or a submeter</li>'
      + '<li>Insurance, permitting, maintenance and monitoring</li>'
      + '<li>Removing everything and restoring the pad at the end of the term</li>'
      + '</ul></div>'
      + '<div><h4>You provide</h4><ul>'
      + '<li>' + esc(acresPhrase(o ? o.leasedAcres : 0.5)) + ' under a ' + term + '-year lease</li>'
      + '<li>Access for installation and for service visits</li>'
      + '<li>Your cooperation on the utility interconnection application</li>'
      + '<li>Existing fiber service, where you already have it</li>'
      + '<li>No capital. No operating obligation. No staff time beyond access.</li>'
      + '</ul></div></div>'
      + '<div class="cl-pt">Terms</div>'
      + '<table class="cl-tbl"><tbody>'
      + kvRow('Structure', 'Ground lease / space use agreement. You keep title to the land.')
      + kvRow('Term', term + ' years, with renewal options')
      + kvRow('Escalation', 'Fixed annual escalator, set in the lease')
      + kvRow('Payment', 'Monthly, in advance, beginning at commercial operation')
      + kvRow('Your power bill', 'Unchanged. Our load sits behind its own meter or an agreed submeter.')
      + kvRow('Exclusivity', 'Limited to the leased area. The rest of your site is yours.')
      + '</tbody></table>'
      + '<div class="cl-fine">' + esc(HOST_DISCLAIMER) + '</div>'
      + '</div>' + pageFoot(host, docName) + '</div>');

    /* ── PAGE 4 · PROCESS + THE QUESTIONS EVERY HOST ASKS ── */
    p.push('<div class="cl-page">'
      + pageHead(b, 'How It Works')
      + '<div class="cl-pb">'
      + '<div class="cl-pt">From this document to your first payment</div>'
      + step(1, 'Site qualification · week 1',
          'We confirm the four requirements on page two. Most of it we do ourselves from public data and a '
        + 'call with your utility. What we need from you is the zoning, who controls the site, and your '
        + 'current fiber service if you have one.')
      + step(2, 'Letter of intent · week 2–3',
          'A short non-binding document setting the rent, the term and the area. It gives us both something '
        + 'to work against and costs you nothing.')
      + step(3, 'Will-serve and fiber · week 3–10',
          'We file the utility interconnection application and secure a carrier commitment. This is the '
        + 'longest step and it is ours to carry. Nothing is built and nothing is owed until it clears.')
      + step(4, 'Lease and permitting · week 10–16',
          'We sign the lease, take it through the AHJ, and complete site diligence. Your first payment date '
        + 'is set in this document.')
      + step(5, 'Install and pay · week 16+',
          'Installation on the pad takes days, not months. Rent begins at commercial operation and is paid '
        + 'monthly for the full term.')
      + '<div class="cl-pt" style="margin-top:20px">Questions we are always asked</div>'
      + faq('What does this cost me?',
          'Nothing. There is no capital contribution and no operating obligation. We pay for the equipment, '
        + 'the interconnection, the fiber, the power and the removal at the end of the term.')
      + faq('What do I get paid?',
          'A market-rate ground lease with an annual escalator, paid monthly'
        + (o ? ' — indicatively ' + rent.num + ' ' + rent.unit + ' at this site' : '')
        + '. If you are willing to let us improve the asset further — canopies, on-site generation, '
        + 'storage — or to take the meter, the consideration goes up from there.')
      + faq('What are you actually putting on my property?',
          'Modular compute equipment in standard shipping-container enclosures on a small fenced pad, with '
        + 'a transformer and a fiber connection. It is unstaffed, it is quiet, and it takes about the '
        + 'footprint of two parking spaces per unit.')
      + faq('How long is the commitment?',
          term + ' years, with renewal options. A shorter term is not a smaller version of this deal — '
        + 'the equipment cannot be financed against it, which is why the term is the one point we hold '
        + 'firm on.')
      + faq('Does this affect my power bill or my operations?',
          'No. Our load sits behind its own meter or an agreed submeter, so your bill is unchanged. Access '
        + 'for service visits is the only call on your time.')
      + faq('What happens at the end?',
          'We remove the equipment and restore the pad, at our cost. That obligation is written into the '
        + 'lease.')
      + '</div>'
      + pageFoot(b.name + (rep ? ' · ' + rep : '') + (repEmail ? ' · ' + repEmail : ''),
                 'Powered by ClearSky-OMEGA')
      + '</div>');

    return p.join('');
  }
  function fmtInt(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

  /* A complete standalone document — what the editor opens in a new window. */
  function proposalDoc(result, opts) {
    opts = opts || {};
    /* Inside the overlay the surrounding chrome already carries the print
       button, and a second one INSIDE the iframe would print the frame from
       the frame — which works, but two Print buttons a centimetre apart is
       the kind of thing that gets clicked wrongly under time pressure. */
    var bare = !!opts.bare;
    var b = brandOf(result, opts.brand);
    var host = opts.host || 'Site Host';
    return '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">'
      + '<meta name="viewport" content="width=device-width,initial-scale=1">'
      + '<title>' + esc(host) + ' — Land Lease Proposal</title>'
      + '<style>html,body{margin:0;padding:0;background:#F1F4F8}'
      + '.cl-wrap{display:flex;flex-direction:column;align-items:center;gap:20px;padding:22px}'
      + '.cl-bar{position:sticky;top:0;z-index:9;background:#0F1B2A;color:#fff;width:100%;'
      + 'padding:10px 18px;display:flex;align-items:center;gap:14px;'
      + "font:600 11px/1 'Inter',-apple-system,Arial,sans-serif;letter-spacing:.04em}"
      + '.cl-bar button{margin-left:auto;background:' + b.accent + ';color:#fff;border:none;border-radius:6px;'
      + 'padding:8px 15px;font:700 11px/1 inherit;cursor:pointer}'
      + '@media print{.cl-bar{display:none}.cl-wrap{padding:0;gap:0;display:block}}'
      + proposalCss(b.accent) + '</style></head><body>'
      + (bare ? '' : '<div class="cl-bar"><span>' + esc(b.name) + ' · Land Lease Proposal · '
          + esc(host) + '</span><button onclick="window.print()">Print / Save as PDF</button></div>')
      + '<div class="cl-wrap">' + proposalPages(result, opts) + '</div></body></html>';
  }

  /* ── SHOWING IT ─────────────────────────────────────────────────────────
     A separate window is the nicer answer — the rep keeps the proposal open
     beside the drawing — so it is tried first. It is NOT relied on: a popup
     blocker eats window.open silently in plenty of browsers, including the
     one this was first tested in, and a rep who presses "Open the proposal"
     and gets an alert about pop-up settings has been handed a support ticket
     instead of a document.

     The fallback is an overlay with the document in an iframe. srcdoc rather
     than a blob URL, so nothing has to be revoked and there is no origin to
     get wrong; printing goes through the iframe's own contentWindow, which
     prints just the four pages and leaves the host page's print rules out of
     it entirely. Escape and the backdrop close it. */
  function openProposal(result, opts) {
    var w = null;
    var html = proposalDoc(result, opts);
    try { w = root.open('', '_blank'); } catch (e) {}
    if (w) {
      try {
        w.document.open();
        w.document.write(html);
        w.document.close();
        return w;
      } catch (e) { /* fall through to the overlay */ }
    }
    return overlay(proposalDoc(result, shallowWith(opts, 'bare', true)));
  }
  function shallowWith(o, k, v) { var x = shallow(o || {}); x[k] = v; return x; }

  var OVERLAY_ID = 'omega-cl-proposal-overlay';

  function overlay(html) {
    var ex = document.getElementById(OVERLAY_ID);
    if (ex) ex.parentNode.removeChild(ex);

    var host = document.createElement('div');
    host.id = OVERLAY_ID;
    host.setAttribute('style', 'position:fixed;inset:0;z-index:2147483000;background:rgba(6,12,22,.86);'
      + 'display:flex;flex-direction:column');

    var bar = document.createElement('div');
    bar.setAttribute('style', 'display:flex;align-items:center;gap:12px;padding:10px 16px;background:#0F1B2A;'
      + "color:#fff;font:600 11px/1 'Inter',-apple-system,Arial,sans-serif;letter-spacing:.04em;flex:0 0 auto");
    bar.innerHTML = '<span>Land Lease Proposal</span>';

    var print = document.createElement('button');
    print.textContent = 'Print / Save as PDF';
    print.setAttribute('style', 'margin-left:auto;background:#2563EB;color:#fff;border:none;border-radius:6px;'
      + 'padding:8px 15px;font:700 11px/1 inherit;cursor:pointer');

    var close = document.createElement('button');
    close.textContent = '\u00d7';
    close.setAttribute('style', 'background:none;border:none;color:#94A3B8;font-size:22px;line-height:1;cursor:pointer');

    var frame = document.createElement('iframe');
    frame.setAttribute('title', 'Land Lease Proposal');
    frame.setAttribute('style', 'flex:1 1 auto;width:100%;border:none;background:#F1F4F8');

    function shut() {
      try { document.removeEventListener('keydown', onKey, true); } catch (e) {}
      if (host.parentNode) host.parentNode.removeChild(host);
    }
    function onKey(e) { if (e.key === 'Escape' || e.keyCode === 27) shut(); }

    print.onclick = function () {
      try { frame.contentWindow.focus(); frame.contentWindow.print(); }
      catch (e) { try { root.print(); } catch (e2) {} }
    };
    close.onclick = shut;
    host.onclick = function (e) { if (e.target === host) shut(); };
    document.addEventListener('keydown', onKey, true);

    bar.appendChild(print); bar.appendChild(close);
    host.appendChild(bar); host.appendChild(frame);
    document.body.appendChild(host);

    /* srcdoc where it is supported; document.write into the frame where it is
       not. Both end up with the same document — the difference is only which
       browsers get there. */
    if ('srcdoc' in frame) frame.srcdoc = html;
    else {
      try {
        var d = frame.contentWindow.document;
        d.open(); d.write(html); d.close();
      } catch (e) {}
    }
    return host;
  }

  root.OmegaComputeLease = {
    evidence: evidence,
    rescore: rescore,
    screen: screen,
    brandOf: brandOf,
    rentPhrase: rentPhrase,
    proposalCss: proposalCss,
    proposalPages: proposalPages,
    proposalDoc: proposalDoc,
    openProposal: openProposal,
    HOST_DISCLAIMER: HOST_DISCLAIMER,
    money: money, moneyShort: moneyShort, esc: esc,
    ENDPOINT: ENDPOINT,
    VERSION: 'compute-lease-client/1.0'
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.OmegaComputeLease;
})(typeof window !== 'undefined' ? window : globalThis);
