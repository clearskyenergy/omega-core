/* ═══════════════════════════════════════════════════════════════════════════════
   OSA · Route to Development — the six data sets, and how ready each one is
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   Implements the readiness spine of Grant's "OSA Project Lifecycle: The Quickest
   route from Origination to Buyers Marketplace" (2026-08-31).

   ── WHY THIS EXISTS AS ITS OWN MODEL ────────────────────────────────────────
   The portal tracks ONE stage per deal: referred → screening → … → operating.
   That answers "how far has this got" and it is a genuinely useful question.

   It does not answer the question Grant's document is about, which is: WHAT IS
   STILL MISSING BEFORE A BUYER WILL LOOK AT THIS. Those are different shapes.
   A stage is a pointer on a ladder; buyer-readiness is six tracks maturing in
   parallel, and a project is ready when the last of them lands — not when the
   pointer reaches a rung. A site can be deep in permitting with no legal
   package at all, and the ladder will happily say "permitting" while the deal
   is unsellable.

   So this sits ALONGSIDE the stage rather than replacing it. Nothing here
   writes a stage and nothing here reads one.

   ── THE SIX DATA SETS ARE THE DELIVERABLE, NOT A CHECKLIST ──────────────────
   They are the contents of the Buyer Folder, quoted from the document's own
   closing section: Summary, Scope, Technical, Engineering/IA, Financial,
   Legal. "Provide the buyer with their customized folder, which must include
   the six complete, verified data sets."

   ── HONEST ABOUT WHAT IS NOT BACKED YET ─────────────────────────────────────
   Five of the six can be computed from fields the deal already carries. LEGAL
   CANNOT. There is nowhere on a deal today to record a ground lease, a PPA, a
   JDA or an interconnection agreement — `agreementRef` is the origination fee
   agreement, a different thing entirely, and using it here would be a lie that
   scores well.

   So legal reports `unbacked` rather than `missing`. The difference matters: a
   missing data set is work somebody has to do, an unbacked one is work the
   PORTAL cannot yet record, and showing it as an empty checkbox would invite
   somebody to tick it somewhere that does not exist. See ROUTE-TO-DEVELOPMENT.md.
   ═══════════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  function g(o, k, d) {
    return (o && o[k] !== undefined && o[k] !== null) ? o[k] : d;
  }
  function num(v) {
    v = Number(v);
    return isFinite(v) && v > 0 ? v : 0;
  }

  /* ── The six, in the document's own order ────────────────────────────────
     `weight` is how much of buyer-readiness each one carries. They are not
     equal: a buyer will read a summary that is thin, and will not look twice
     at a project with no legal package. The weights say that out loud rather
     than hiding it in an average. */
  var SETS = [
    { key:'summary',   label:'Summary',        weight:10,
      blurb:'The investment thesis and overview.' },
    { key:'scope',     label:'Scope',          weight:15,
      blurb:'The physical and operational boundaries of the asset.' },
    { key:'technical', label:'Technical',      weight:20,
      blurb:'Design specifications and technology parameters.' },
    { key:'engineering', label:'Engineering / IA', weight:20,
      blurb:'Interconnection approvals and system engineering.' },
    { key:'financial', label:'Financial',      weight:20,
      blurb:'The financial model, returns and valuation.' },
    { key:'legal',     label:'Legal',          weight:15,
      blurb:'Underlying contracts, permits and transfer rights.' }
  ];

  /* Three states, and the third is the point of this module.
       ready    — enough is recorded that a buyer could read it
       partial  — started, not finished
       missing  — nothing recorded, and there is somewhere to record it
       unbacked — nothing recorded, and the portal has NOWHERE to record it */
  function state(done, started) {
    return done ? 'ready' : (started ? 'partial' : 'missing');
  }

  /* ── Summary ──────────────────────────────────────────────────────────────
     Origination's output. A name and an address are not a thesis, so a
     summary is only `ready` once somebody has written the narrative field the
     intake form offers. */
  function summaryOf(d) {
    var hasNarrative = String(g(d, 'summary', '') || g(d, 'siteNotes', '')).trim().length >= 40;
    var hasBasics = !!(String(g(d, 'name', '')).trim() && String(g(d, 'address', '')).trim());
    return { state: state(hasNarrative && hasBasics, hasBasics),
             detail: hasBasics ? (hasNarrative ? 'Narrative and location recorded'
                                               : 'Location recorded, no written thesis')
                               : 'No location' };
  }

  /* ── Scope ────────────────────────────────────────────────────────────────
     What is actually being built and how big. Evaluation's output. */
  function scopeOf(d) {
    var type = String(g(d, 'projectType', '')).trim();
    var cats = (g(d, 'categories', []) || []).length;
    var size = num(g(d, 'sizeMw', 0)) || num(g(d, 'sizeMwh', 0));
    var load = num(g(d, 'loadKw', 0)) || num(g(d, 'annualKwh', 0)) || num(g(d, 'monthlyBillUsd', 0));
    var started = !!(type || cats || size || load);
    return { state: state(!!((type || cats) && size && load), started),
             detail: !started ? 'No project type, size or load'
                   : (size ? '' : 'No size. ') + (load ? '' : 'No load or usage data. ') || 'Type, size and load recorded' };
  }

  /* ── Technical ────────────────────────────────────────────────────────────
     Phase 3.1. An editor project is the design; `design.status` is where the
     design team records that it is finished. */
  function technicalOf(d) {
    var design = g(d, 'design', {}) || {};
    var complete = String(g(design, 'status', '')) === 'complete';
    var started = !!(g(d, 'projectId', '') || g(design, 'status', '') || g(design, 'sentAt', ''));
    return { state: state(complete, started),
             detail: complete ? 'Design complete'
                   : started ? 'Design in progress' : 'No design started' };
  }

  /* ── Engineering / IA ─────────────────────────────────────────────────────
     Phase 3.2. Interconnection and permitting are the buyer-facing part; CIR's
     engineering quote is the cost part and has nowhere to live yet, so it does
     not count toward ready. Noted in the detail so it is visible rather than
     silently ignored. */
  function engineeringOf(d) {
    var p = g(d, 'permitting', {}) || {};
    var apps = g(p, 'applications', []) || [];
    var grid = g(d, 'grid', {}) || {};
    var hasGrid = !!(g(grid, 'score', null) !== null || (g(grid, 'substations', []) || []).length);
    var started = !!(apps.length || g(p, 'startedAt', '') || g(p, 'ahj', '') || hasGrid);
    var filed = apps.filter(function (a) {
      return String(g(a, 'status', '')).toLowerCase() !== 'not_started';
    }).length;
    return { state: state(filed > 0 && hasGrid, started),
             detail: !started ? 'No interconnection or permitting activity'
                   : filed ? filed + ' application(s) filed' : 'Grid screened, nothing filed' };
  }

  /* ── Financial ────────────────────────────────────────────────────────────
     Phase 5. A capex number is an estimate; a pro forma is what a buyer
     underwrites, and the document is explicit that the estimate matures into
     the model. Committed or closed funding is the strongest signal. */
  function financialOf(d) {
    var f = g(d, 'funding', {}) || {};
    var capex = num(g(d, 'capexUsd', 0));
    var asked = num(g(f, 'requestedUsd', 0));
    var got = num(g(f, 'committedUsd', 0)) || num(g(f, 'closedUsd', 0));
    var started = !!(capex || asked || got || num(g(g(d, 'preDev', {}), 'spentUsd', 0)));
    return { state: state(!!(capex && (asked || got)), started),
             detail: got ? 'Funding committed'
                   : (capex && asked) ? 'Capex and raise modelled'
                   : started ? 'Costs started, no complete model' : 'No financial model' };
  }

  /* ── Legal ────────────────────────────────────────────────────────────────
     Phase 4, and the one the portal cannot record. Ground leases, PPAs, JDAs,
     interconnection agreements — none has a field.

     `agreementRef` is deliberately NOT consulted. It is the ORIGINATION fee
     agreement between OSA and the referring partner, which says nothing about
     site control, and scoring it here would make every referred deal look
     legally packaged. A wrong signal is worse than an absent one. */
  function legalOf(d) {
    return { state: 'unbacked',
             detail: 'The portal has no field for leases, PPAs, JDAs or '
                   + 'interconnection agreements yet' };
  }

  var COMPUTE = {
    summary: summaryOf, scope: scopeOf, technical: technicalOf,
    engineering: engineeringOf, financial: financialOf, legal: legalOf
  };

  /* ── Buyer-folder readiness for one deal ─────────────────────────────────
     Returns every set with its state, plus a percentage.

     `unbacked` scores ZERO and stays in the denominator. It would be easy to
     drop it and let projects read 100% — and that number would mean "ready
     except for the part nobody can fill in", which is exactly the sentence a
     buyer would discover on their own. The ceiling is 85% until legal has
     somewhere to live, and that ceiling is the feature. */
  function readiness(deal) {
    var sets = SETS.map(function (s) {
      var r = COMPUTE[s.key](deal || {});
      return { key:s.key, label:s.label, weight:s.weight, blurb:s.blurb,
               state:r.state, detail:r.detail };
    });
    var earned = 0, total = 0;
    sets.forEach(function (s) {
      total += s.weight;
      if (s.state === 'ready') earned += s.weight;
      else if (s.state === 'partial') earned += s.weight / 2;
    });
    var pct = total ? Math.round((earned / total) * 100) : 0;
    return {
      sets: sets,
      pct: pct,
      ready: sets.every(function (s) { return s.state === 'ready'; }),
      blocking: sets.filter(function (s) {
        return s.state === 'missing' || s.state === 'unbacked';
      }).map(function (s) { return s.label; }),
      ceiling: sets.some(function (s) { return s.state === 'unbacked'; })
    };
  }

  /* Rank a list by how close each is to the Buyer's Marketplace — the
     document's "score weighted matrix … showing which projects are closest to
     the Buyer's market". Ties break on the number of finished sets, so a deal
     with four solid sets outranks one with six half-finished ones. */
  function closestToMarket(deals) {
    return (deals || []).map(function (d) {
      var r = readiness(d);
      return { deal: d, readiness: r,
               done: r.sets.filter(function (s) { return s.state === 'ready'; }).length };
    }).sort(function (a, b) {
      return (b.readiness.pct - a.readiness.pct) || (b.done - a.done);
    });
  }

  global.RouteToDevelopment = {
    SETS: SETS,
    readiness: readiness,
    closestToMarket: closestToMarket
  };
})(typeof window !== 'undefined' ? window : this);
