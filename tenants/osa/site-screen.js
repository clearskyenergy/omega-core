/* tenants/osa/site-screen.js — a partner's site list becomes a screened portfolio.
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   ES5, no build step, no dependencies, no Firestore. Everything in here is a
   pure function over rows and deals, so it runs in node under
   scripts/tests/tositescreen.js as well as in the portfolio console. The
   writes live in ingest-data.js, which calls this.

   ── THE TWO FILES A PARTNER SENDS ──
   iQGen's referral file is our own template coming back: sixty-three sites,
   every one an address and a target size, all "Edge Compute". Their
   screening scorecard is a second workbook: ten of those sites, nine axes
   scored against a published 100-point rubric, a total and a
   recommendation. The first file makes deals. The second makes them
   screened. Neither is re-keyed by hand.

   ── WHAT A SITE IS CALLED ──
   The scorecard says "Norwich Edge"; the referral file says "IQEDG Norwich
   Edge". Same site, and a partner's own prefix on the name is the most
   common way the two disagree. siteKey() drops one leading all-caps token
   and compares the rest, and a ref column ("CT-25") wins over the name
   whenever both files carry one. Matching is shown before anything is
   written, so a wrong guess is a row somebody unticks, not a score on the
   wrong deal.

   ── "SITE TO BE SCREENED" IS A STAGE, NOT A COLLECTION ──
   Every row lands as a deal at `referred`. The ten that are real projects
   are the ones promoted: advanced to screening and given an editor project.
   The forty are the same kind of record one stage earlier. The funnel is
   the list; nothing here invents a second one.

   ── A SCORECARD ROW BECOMES A VIABILITY SCORE ──
   The console already has an append-only viability block with a threshold
   and a pass/fail verdict, and the `qualified` gate reads it. The rubric's
   own bands set the threshold ("worth pursuing" starts at 65), the nine
   axes become the criteria with the rubric's maxima as weights, and the
   recommendation travels as the summary. A REJECT stays where it was, with
   the score on the record as information — that was the decision. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SiteScreen = factory();
}(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  function norm(s) {
    return String(s == null ? '' : s).toLowerCase()
      .replace(/[_\-\/]+/g, ' ').replace(/[^a-z0-9+ ]/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function num(v) {
    if (v == null || v === '') return null;
    var x = Number(String(v).replace(/[,$\s]/g, ''));
    return isFinite(x) ? x : null;
  }

  /* ── Project types ──────────────────────────────────────────────────────
     The importer refused anything that was not one of our eleven keys and
     left the type blank with a warning. "Edge Compute" — the words on every
     row of a partner's file — is `compute` in our vocabulary, and asking
     them to retype sixty-three cells is the friction the template exists to
     remove. Keys are ours; the lists are what partners actually write. */
  var TYPE_ALIAS = {
    compute:       ['compute', 'edge compute', 'edge', 'edge data center', 'edge data centre',
                    'modular data center', 'modular data centre', 'modular compute', 'mdc',
                    'data center', 'data centre', 'datacenter', 'dc', 'compute load', 'ai compute',
                    'compute pod', 'modular dc'],
    compute_gen:   ['compute gen', 'compute + gen', 'compute + generation', 'compute with generation',
                    'btm compute', 'compute and generation', 'compute + on site generation',
                    'compute on site generation', 'compute+gen'],
    solar:         ['solar', 'pv', 'solar pv', 'photovoltaic', 'solar farm'],
    solar_bess:    ['solar bess', 'solar + bess', 'solar + storage', 'solar storage',
                    'solar and storage', 'pv + bess', 'pv bess', 'hybrid', 'solar+bess', 'solar+storage'],
    bess:          ['bess', 'battery', 'storage', 'battery storage', 'standalone storage',
                    'energy storage', 'ess', 'standalone bess'],
    microgrid:     ['microgrid', 'micro grid'],
    der:           ['der', 'distributed energy', 'distributed energy resources'],
    dcfc:          ['dcfc', 'dc fast charging', 'fast charging', 'ev', 'ev charging', 'charging',
                    'evse', 'ev fast charging'],
    l2:            ['l2', 'level 2', 'level 2 charging', 'level two'],
    charging_bess: ['charging bess', 'charging + storage', 'charging storage', 'charging+storage'],
    powergen:      ['powergen', 'on site generation', 'onsite generation', 'generation', 'genset',
                    'chp', 'fuel cell', 'fuel cells', 'power gen', 'on site power']
  };

  /* raw -> one of our keys, or '' when nothing matches. `known` (optional) is
     the list of keys this console actually builds; an alias that resolves to
     a key not in it is still ''. */
  function aliasProjectType(raw, known) {
    var k = norm(raw).replace(/\s*\+\s*/g, ' + ');
    if (!k) return '';
    var keyed = k.replace(/ /g, '_');
    var ok = function (key) { return !known || known.indexOf(key) >= 0; };
    if (TYPE_ALIAS.hasOwnProperty(keyed) && ok(keyed)) return keyed;
    for (var key in TYPE_ALIAS) {
      if (!TYPE_ALIAS.hasOwnProperty(key)) continue;
      var list = TYPE_ALIAS[key];
      for (var i = 0; i < list.length; i++) {
        if (list[i] === k) return ok(key) ? key : '';
      }
    }
    return '';
  }

  /* ── Site identity ──────────────────────────────────────────────────────
     A partner prefixes their own code onto every site name ("IQEDG Norwich
     Edge"); their screen sheet does not ("Norwich Edge"). One leading
     all-caps token is dropped when there is more to the name than that
     token. Only the first, and only one: "EV Alamosa" keeps its EV, and
     "Preston Edge I" keeps its I — those are different sites from
     "Preston Edge II". */
  function siteKey(name) {
    var s = String(name == null ? '' : name).trim();
    var toks = s.split(/\s+/);
    if (toks.length > 1 && /^[A-Z][A-Z0-9]{2,7}$/.test(toks[0])) toks = toks.slice(1);
    return norm(toks.join(' '));
  }
  function sameSite(a, b) {
    var ka = siteKey(a), kb = siteKey(b);
    if (!ka || !kb) return false;
    if (ka === kb) return true;
    /* "norwich edge" against "iqgen norwich edge" when the prefix was not
       all-caps — a word-boundary suffix match, never a substring one, so
       "ware edge" does not claim "delaware edge". */
    return (' ' + ka).slice(-(kb.length + 1)) === ' ' + kb
        || (' ' + kb).slice(-(ka.length + 1)) === ' ' + ka;
  }

  function refOf(deal) {
    var x = deal && deal.externalIds && deal.externalIds.partnerRef;
    if (!x && deal && deal.intakeId) x = deal.intakeId;
    return String(x || '').trim().toLowerCase();
  }
  function orgOf(deal) {
    return String((deal && deal.origination && deal.origination.partnerOrg) || '').toLowerCase();
  }

  /* An existing deal this row IS. Ref first (exact, same partner), then the
     site name (same partner). Returns null rather than guessing across
     partners: two partners can each bring a "Main St" and both are real. */
  function findExisting(values, deals) {
    var org = String(values.partnerOrg || '').toLowerCase();
    var ref = String(values.ref || '').trim().toLowerCase();
    var i, d;
    if (ref) {
      for (i = 0; i < (deals || []).length; i++) {
        d = deals[i];
        if (orgOf(d) === org && refOf(d) === ref) return d;
      }
    }
    var key = siteKey(values.name);
    if (!key) return null;
    for (i = 0; i < (deals || []).length; i++) {
      d = deals[i];
      if (orgOf(d) === org && siteKey(d.name) === key) return d;
    }
    return null;
  }

  function isYes(v) {
    return /^\s*(y|yes|true|1|x|project|promote|promoted)\s*$/i.test(String(v == null ? '' : v));
  }

  /* ── The scorecard ───────────────────────────────────────────────────────
     Rows are the sheet as SheetJS hands it over (array of arrays). Nothing
     about the layout is assumed beyond: a header row that has a "Ref" cell
     and a "TOTAL" cell, descriptor columns before the axes, the axes in
     between, a "Maximum available" row that carries each axis's ceiling, and
     an optional band table. Anything else is reported, not guessed. */
  function idx(headers, re) {
    for (var i = 0; i < headers.length; i++) {
      if (re.test(String(headers[i] == null ? '' : headers[i]).trim())) return i;
    }
    return -1;
  }
  function cellStr(row, i) {
    return i < 0 || !row ? '' : String(row[i] == null ? '' : row[i]).trim();
  }

  function parseScorecard(rows) {
    rows = rows || [];
    var hi = -1, i, j;
    for (i = 0; i < rows.length; i++) {
      var r = rows[i] || [];
      if (idx(r, /^ref\b/i) >= 0 && idx(r, /^total$/i) >= 0) { hi = i; break; }
    }
    if (hi < 0) return { ok: false, why: 'No header row with both a "Ref" and a "TOTAL" column.' };

    var H = rows[hi];
    var c = {
      ref:     idx(H, /^ref\b/i),
      site:    idx(H, /^(site|site name|name)$/i),
      town:    idx(H, /town|city/i),
      utility: idx(H, /^utilit/i),
      zoning:  idx(H, /^zoning$/i),
      total:   idx(H, /^total$/i),
      rec:     idx(H, /recommend/i)
    };
    if (c.site < 0) return { ok: false, why: 'No "Site" column.' };

    var lastDesc = Math.max(c.ref, c.site, c.town, c.utility, c.zoning);
    var axes = [];
    for (j = lastDesc + 1; j < c.total; j++) {
      var label = cellStr(H, j);
      if (!label) continue;
      axes.push({ col: j, key: norm(label).replace(/ /g, '_').slice(0, 40), label: label, max: null });
    }
    if (!axes.length) return { ok: false, why: 'No scoring columns between the site details and TOTAL.' };

    /* The band table sits wherever the author put it, usually under a blank
       line after the ceiling row. Found on its own rather than reached by
       the data loop, which stops at the first blank after the ceiling. */
    var bands = [], bandsAt = -1;
    for (i = hi + 1; i < rows.length; i++) {
      if (/threshold bands/i.test(cellStr(rows[i], 0))) { bandsAt = i; bands = parseBands(rows, i + 1); break; }
    }

    var out = [], maxTotal = null, seenMax = false;
    for (i = hi + 1; i < rows.length && i !== bandsAt; i++) {
      var row = rows[i] || [];
      var site = cellStr(row, c.site);
      if (/^maximum/i.test(site) || /^maximum/i.test(cellStr(row, c.ref))) {
        for (j = 0; j < axes.length; j++) axes[j].max = num(row[axes[j].col]);
        maxTotal = num(row[c.total]);
        seenMax = true;
        continue;
      }
      var total = num(row[c.total]);
      if (!site || total == null) { if (seenMax) break; continue; }
      var townState = cellStr(row, c.town), st = '';
      var m = /,\s*([A-Za-z]{2})\s*$/.exec(townState);
      if (m) st = m[1].toUpperCase();
      out.push({
        row: i + 1,
        ref: cellStr(row, c.ref),
        site: site, town: townState, state: st,
        utility: cellStr(row, c.utility), zoning: cellStr(row, c.zoning),
        points: axes.map(function (a) { return num(row[a.col]); }),
        total: total,
        recommendation: cellStr(row, c.rec).toUpperCase()
      });
    }
    if (maxTotal == null) {
      /* No ceiling row: the axes' maxima are unknown, and the total is taken
         as already on 100 — said so in the preview rather than assumed. */
      maxTotal = 100;
    }
    return {
      ok: true, headerRow: hi + 1, axes: axes, rows: out,
      maxTotal: maxTotal, bands: bands,
      threshold: thresholdFrom(bands),
      hasMaxRow: seenMax
    };
  }

  /* "80-100 | Strong candidate…", "65-79 | Worth pursuing…", "Below 50 | Reject…" */
  function parseBands(rows, from) {
    var out = [];
    for (var i = from; i < rows.length; i++) {
      var r = rows[i] || [];
      var a = cellStr(r, 0), b = cellStr(r, 1);
      if (!a) { if (out.length) break; continue; }
      if (/^band$/i.test(a)) continue;
      var m = /^(\d+)\s*[-–—]\s*(\d+)$/.exec(a), lo = null, hi = null;
      if (m) { lo = +m[1]; hi = +m[2]; }
      else if ((m = /^below\s+(\d+)/i.exec(a))) { lo = 0; hi = +m[1] - 1; }
      else if ((m = /^(\d+)\s*\+$/.exec(a))) { lo = +m[1]; hi = 100; }
      else if (out.length) break; else continue;
      out.push({ lo: lo, hi: hi, meaning: b });
    }
    return out;
  }

  /* The lowest band that still says "pursue" is the pass line. The rubric's
     own words decide it; 65 is only the fallback when the sheet carries no
     band table at all. */
  function thresholdFrom(bands) {
    var best = null;
    (bands || []).forEach(function (b) {
      if (/pursu|strong|proceed|move|go\b/i.test(b.meaning) && !/reject|pause/i.test(b.meaning)) {
        if (best == null || b.lo < best) best = b.lo;
      }
    });
    return best == null ? 65 : best;
  }

  function bandOf(total, bands) {
    for (var i = 0; i < (bands || []).length; i++) {
      if (total >= bands[i].lo && total <= bands[i].hi) return bands[i];
    }
    return null;
  }

  /* Each scorecard row against the deals. `how` says what matched so the
     preview can show it; `candidates` lists the near misses when nothing
     did, so the person can pick rather than retype. */
  function matchScorecard(card, deals, partnerOrg) {
    var org = String(partnerOrg || '').toLowerCase();
    return (card.rows || []).map(function (row) {
      var pool = (deals || []).filter(function (d) {
        return d && d.stage !== 'discarded' && (!org || orgOf(d) === org);
      });
      var ref = String(row.ref || '').trim().toLowerCase(), hit = null, how = '';
      if (ref) {
        for (var i = 0; i < pool.length && !hit; i++) if (refOf(pool[i]) === ref) { hit = pool[i]; how = 'ref'; }
      }
      if (!hit) {
        var exact = pool.filter(function (d) { return siteKey(d.name) === siteKey(row.site); });
        if (exact.length === 1) { hit = exact[0]; how = 'name'; }
        else if (!exact.length) {
          var near = pool.filter(function (d) { return sameSite(d.name, row.site); });
          if (near.length === 1) { hit = near[0]; how = 'name~'; }
          else if (near.length > 1) return { row: row, deal: null, how: '', candidates: near };
        } else return { row: row, deal: null, how: '', candidates: exact };
      }
      return { row: row, deal: hit, how: how, candidates: [] };
    });
  }

  /* What postScore() takes, plus the extras that go on the viability block. */
  function scorePayload(row, card) {
    var maxT = card.maxTotal || 100;
    var score = Math.round(row.total * 100 / maxT);
    var criteria = card.axes.map(function (a, i) {
      var p = row.points[i];
      return { key: a.key, label: a.label, weight: a.max != null ? a.max : 1,
               value: p, unscored: p == null,
               note: p == null ? 'not scored' : p + (a.max != null ? '/' + a.max : '') };
    });
    var band = bandOf(row.total, card.bands);
    return {
      score: score,
      threshold: card.threshold,
      model: 'powered-land-scorecard-v1',
      source: 'powered-land-scorecard',
      criteria: criteria,
      summary: (row.recommendation || (band ? band.meaning : '') || 'scored')
             + ' — ' + row.total + '/' + maxT
             + (band && row.recommendation ? ' · ' + band.meaning : ''),
      verdictWord: row.recommendation || '',
      passes: score >= card.threshold && !/reject/i.test(row.recommendation || '')
    };
  }

  /* ── The compute-lease screen, onto a deal ─────────────────────────────
     /api/compute-lease returns four gates and a verdict. The deal keeps the
     verdict, each gate's status and headline, the tranche and the asks —
     the parts a person acts on — and not the priced offer, which belongs to
     the proposal tool and its own entitlement. */
  function leaseScreenRecord(result, meta) {
    result = result || {}; meta = meta || {};
    var gates = {}, order = result.gateOrder || ['power', 'fiber', 'zoning', 'siteControl'];
    order.forEach(function (k) {
      var g = (result.gates || {})[k];
      if (!g) return;
      gates[k] = { status: g.status || 'unconfirmed', score: num(g.score),
                   headline: g.headline || '', label: g.label || k };
    });
    return {
      verdict: result.verdict || '',
      offerable: result.offerable === true,
      verdictReason: result.verdictReason || '',
      gates: gates, gateOrder: order,
      tranche: result.tranche ? { n: result.tranche.n == null ? null : result.tranche.n,
                                  label: result.tranche.label || '' } : null,
      asks: (result.asks || []).map(function (a) {
        return typeof a === 'string' ? a : ((a.gate ? a.gate + ': ' : '') + (a.ask || '')); }),
      findings: (result.findings || []).map(function (f) {
        return { severity: f.severity || '', text: f.text || String(f) }; }),
      model: result.model || 'compute-lease',
      site: result.site ? { lat: num(result.site.lat), lng: num(result.site.lng),
                            address: result.site.address || '' } : null,
      ranAt: meta.at || null, ranBy: meta.by || ''
    };
  }

  /* The screen as a prescreen: only a disqualification fails it. "Incomplete"
     is a site nobody has answered for yet, and failing that would condemn
     forty sites for a form nobody filled in. */
  function leasePrescreen(result, meta) {
    result = result || {}; meta = meta || {};
    var fail = result.verdict === 'disqualified';
    var why = [];
    var order = result.gateOrder || ['power', 'fiber', 'zoning', 'siteControl'];
    order.forEach(function (k) {
      var g = (result.gates || {})[k];
      if (g && (g.status === 'fail' || (!fail && g.status === 'conditional')))
        why.push((g.label || k) + ': ' + (g.headline || g.status));
    });
    return {
      verdict: fail ? 'fail' : 'pass',
      reason: 'Compute screen — ' + (result.verdict || 'no verdict')
            + (result.verdictReason ? ': ' + result.verdictReason : '')
            + (why.length ? ' (' + why.join('; ') + ')' : ''),
      fit: '', size: '', offtake: '', timing: '',
      source: 'compute-lease',
      by: meta.by || '', at: meta.at || null
    };
  }

  /* The rep's answers the deal can already supply. Everything else is left
     unknown so the gate reports it as unconfirmed rather than guessed. */
  function repFromDeal(deal) {
    deal = deal || {};
    var r = { address: deal.address || '', termYears: 15 };
    if (deal.sizeMw != null) r.availableMw = deal.sizeMw;
    if (deal.grid && deal.grid.lat != null) { r.lat = deal.grid.lat; r.lng = deal.grid.lng; }
    if (deal.permitting && deal.permitting.owner) r.ownerName = deal.permitting.owner;
    return r;
  }

  function isComputeType(pt) {
    return /^compute/.test(String(pt || ''));
  }

  /* The editor link for a promoted deal. `auto=compute` is what the editor's
     autopilot will dispatch to the modular build once core carries that mode;
     today it degrades to the map/parcel/roads/score run on the loaded
     project, which is the site preparation the design starts from. Only
     appended for compute deals with an address: the autopilot refuses to
     run without one. */
  function editorLink(base, projectId, deal) {
    var u = base + (base.indexOf('?') >= 0 ? '&' : '?') + 'project=' + encodeURIComponent(projectId);
    if (deal && isComputeType(deal.projectType) && deal.address) {
      u += '&address=' + encodeURIComponent(deal.address) + '&auto=compute&from=portfolio';
      if (deal.sizeMw != null) u += '&mw=' + encodeURIComponent(deal.sizeMw);
    }
    return u;
  }

  return {
    TYPE_ALIAS: TYPE_ALIAS, aliasProjectType: aliasProjectType,
    siteKey: siteKey, sameSite: sameSite, findExisting: findExisting, isYes: isYes,
    parseScorecard: parseScorecard, parseBands: parseBands, thresholdFrom: thresholdFrom,
    bandOf: bandOf, matchScorecard: matchScorecard, scorePayload: scorePayload,
    leaseScreenRecord: leaseScreenRecord, leasePrescreen: leasePrescreen,
    repFromDeal: repFromDeal, isComputeType: isComputeType, editorLink: editorLink,
    norm: norm, num: num
  };
}));
