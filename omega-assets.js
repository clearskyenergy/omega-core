/* ══════════════════════════════════════════════════════════════════════════
   CLEARSKY-OMEGA · ASSET OWNER COMMAND CENTER  (omega-assets.js)
   ------------------------------------------------------------------
   SHARED PLATFORM FILE — tenant-neutral. Contains no customer name, domain,
   logo or colour. The tenant is read at runtime from OMEGA_WORKSPACE, exactly
   like omega-brand.js and omega-terms.js do it. Anything tenant-specific lives
   in that deployment's /config.js under `tenant.assets`.

   ─────────────────────────────────────────────────────────────────────────
   WHAT THIS ANSWERS
   ─────────────────────────────────────────────────────────────────────────
   The stock dashboard is built for a DEVELOPER: how many sites, what stage,
   how much storage quoted. This block is built for an OWNER of energized
   assets, which is a different set of questions:

       What have we been offered, and by whom?     → offers strip + offers table
       What do we actually own, and what is it worth? → assets on the books
       What is it earning and what is it costing?   → portfolio P&L, NOI
       Is it a good investment?                     → IRR, ROI, cash-on-cash,
                                                      payback
       What's live right now?                       → active project list

   It reads the SAME `projects` collection the rest of the portal reads, plus
   one new collection of finance-marketplace offers. Nothing here writes.

   ─────────────────────────────────────────────────────────────────────────
   FIRESTORE CONTRACT
   ─────────────────────────────────────────────────────────────────────────
   projects/{id}   — existing fields used as-is:
       orgId, name, stage, bessKwh, capex, incentive, annualRevenue, utility

     and these OPTIONAL fields, which are what turn a developer pipeline into
     an owned-asset book. Every one degrades safely if absent:

       ownership      'owned' | 'financed' | 'under-offer' | 'pipeline' | 'sold'
                      Absent → derived: stage 'online' ⇒ 'owned', else 'pipeline'.
                      That derivation is a convenience, not a truth: tag the
                      docs and the numbers stop being an inference.
       opex           number — annual operating cost, $/yr
       opexLines      { om, insurance, lease, monitoring, warranty, admin }
                      Optional breakdown. When present the P&L itemizes; when
                      absent it shows one "Operating expenses" line rather than
                      inventing an allocation.
       revenueLines   { demand, energy, capacity, services, offtake }
       inServiceDate  'YYYY-MM-DD' — drives straight-line book value
       termYears      number — modeled life (default assets.termYears)
       irr            decimal (0.14 = 14%) — overrides the computed IRR
       financedAmount number — debt/tax-equity/lease principal on the asset
       debtService    number — annual $, if financed
       residualValue  number — end-of-term value used in the IRR cash flows

   financeOffers/{id}  — one doc per offer moving through the marketplace:
       orgId          required, scopes the read
       projectId      optional link to projects/{id}
       projectName    string (used when projectId is absent)
       partner        string — who made the offer
       structure      'debt' | 'tax-equity' | 'sale-leaseback' | 'esa-ppa'
                      | 'equipment' | 'equity'
       amount         number — capital offered, $
       rate           decimal — coupon / discount rate, optional
       termYears      number, optional
       status         'received' | 'reviewing' | 'countered' | 'accepted'
                      | 'declined' | 'expired'
       createdAt      Firestore timestamp or 'YYYY-MM-DD'

   Deploy firestore-assets.rules before expecting reads to succeed.

   ─────────────────────────────────────────────────────────────────────────
   SAMPLE MODE
   ─────────────────────────────────────────────────────────────────────────
   With `tenant.assets.sampleData: true`, an illustrative portfolio fills the
   block ONLY while both collections come back empty. Real data always wins —
   the moment one project or one offer exists for the org, the sample is gone.
   Sample mode paints a ribbon saying so. Never ship a demo screenshot without
   that ribbon in frame.
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var BLOCK_KEY = 'assets';
  var MOUNTED   = false;

  /* ── Config ─────────────────────────────────────────────────────────────
     Everything is optional; the defaults below are what a tenant gets if
     /config.js says nothing at all. */
  function cfg() {
    var ws = global.OMEGA_WORKSPACE ||
             (global.CLEARSKY_CONFIG && global.CLEARSKY_CONFIG.tenant) || {};
    var a  = ws.assets || {};
    return {
      enabled:      a.enabled !== false,
      sampleData:   a.sampleData === true,
      insertAfter:  a.insertAfter || 'apps',
      collection:   a.offersCollection || 'financeOffers',
      termYears:    Number(a.termYears) || 20,
      currency:     a.currency || 'USD',
      title:        a.title || 'Owned Asset Portfolio',
      offersLabel:  a.offersLabel || 'Offers received',
      marketplaceKey: a.marketplaceKey || 'financing'
    };
  }

  function ws() { return global.OMEGA_WORKSPACE || {}; }

  /* ── Small helpers ──────────────────────────────────────────────────── */

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* Compact for KPI faces: $1.4M, $820K. */
  function money(n) {
    n = Number(n) || 0;
    var sign = n < 0 ? '-' : '';
    n = Math.abs(n);
    if (n >= 1e6) return sign + '$' + (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + 'M';
    if (n >= 1e3) return sign + '$' + Math.round(n / 1e3) + 'K';
    return sign + '$' + Math.round(n);
  }

  /* Full dollars for the P&L, where rounding to the nearest $100K hides the
     line items that make the statement worth reading. */
  function dollars(n) {
    n = Math.round(Number(n) || 0);
    var sign = n < 0 ? '-' : '';
    return sign + '$' + Math.abs(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function pct(x, dp) {
    if (x == null || !isFinite(x)) return '—';
    return (x * 100).toFixed(dp == null ? 1 : dp) + '%';
  }

  function num(v) { return Number(v) || 0; }

  function dateOf(v) {
    if (!v) return null;
    if (typeof v === 'string') { var d = new Date(v + 'T00:00:00'); return isNaN(d) ? null : d; }
    if (v.toDate) { try { return v.toDate(); } catch (e) { return null; } }
    if (v instanceof Date) return v;
    return null;
  }

  function fmtDate(d) {
    d = dateOf(d);
    if (!d) return '—';
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function yearsSince(d) {
    d = dateOf(d);
    if (!d) return 0;
    return Math.max(0, (Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000));
  }

  /* IRR by bisection on NPV. flows[0] is the outflow at t0.
     Returns null when the sign never changes — i.e. the project never pays
     back, in which case an IRR is not a real number and we say "—" rather
     than printing something confident and wrong. */
  function irr(flows) {
    function npv(r) {
      var v = 0;
      for (var i = 0; i < flows.length; i++) v += flows[i] / Math.pow(1 + r, i);
      return v;
    }
    var lo = -0.95, hi = 3;
    if (npv(lo) * npv(hi) > 0) return null;
    for (var i = 0; i < 90; i++) {
      var mid = (lo + hi) / 2;
      if (npv(lo) * npv(mid) <= 0) hi = mid; else lo = mid;
    }
    return (lo + hi) / 2;
  }

  /* ── Firestore ──────────────────────────────────────────────────────── */

  function db() {
    try {
      return (global.firebase && firebase.apps && firebase.apps.length)
        ? firebase.firestore() : null;
    } catch (e) { return null; }
  }

  function orgId() {
    return (ws().orgId) ||
           (global.CLEARSKY_CONFIG && global.CLEARSKY_CONFIG.tenant &&
            global.CLEARSKY_CONFIG.tenant.orgId) || '';
  }

  function fetchAll() {
    var d = db(), org = orgId(), C = cfg();
    if (!d || !org) return Promise.resolve({ projects: [], offers: [], error: 'no-db' });

    var pP = d.collection('projects').where('orgId', '==', org).get()
      .then(function (s) { var o = []; s.forEach(function (x) { var v = x.data(); v.__id = x.id; o.push(v); }); return o; })
      ['catch'](function (e) { console.warn('[omega-assets] projects read failed', e); return []; });

    var pO = d.collection(C.collection).where('orgId', '==', org).get()
      .then(function (s) { var o = []; s.forEach(function (x) { var v = x.data(); v.__id = x.id; o.push(v); }); return o; })
      ['catch'](function (e) {
        /* A missing rule for the offers collection is the single most likely
           reason this panel is blank on a fresh deploy. Say which one. */
        if (e && e.code === 'permission-denied') {
          console.error('[omega-assets] ' + C.collection + ' read denied — deploy firestore-assets.rules');
        }
        return [];
      });

    return Promise.all([pP, pO]).then(function (r) {
      return { projects: r[0], offers: r[1] };
    });
  }

  /* ══════════════════════════════════════════════════════════════════════
     SAMPLE PORTFOLIO
     Illustrative only. Behind-the-meter C&I storage in Southern California:
     demand-charge management plus SGIP, which is the shape a distributor's
     first owned fleet actually takes. Numbers are round on purpose — they are
     there to show what the panel reports, not to forecast anything.
     ══════════════════════════════════════════════════════════════════════ */
  function samplePortfolio() {
    return {
      sample: true,
      projects: [
        { name: 'Brea Distribution Center', utility: 'SCE', stage: 'online', ownership: 'owned',
          bessKwh: 1000, capex: 585000, incentive: 210000, annualRevenue: 64000, opex: 14200,
          opexLines: { om: 5200, insurance: 2600, monitoring: 1800, warranty: 3600, admin: 1000 },
          revenueLines: { demand: 45000, energy: 9000, capacity: 10000 },
          inServiceDate: '2025-04-15', termYears: 20, residualValue: 55000, financedAmount: 0 },

        { name: 'Signal Hill Branch', utility: 'SCE', stage: 'online', ownership: 'owned',
          bessKwh: 500, capex: 312000, incentive: 108000, annualRevenue: 33500, opex: 7800,
          opexLines: { om: 2900, insurance: 1400, monitoring: 1200, warranty: 1800, admin: 500 },
          revenueLines: { demand: 24000, energy: 4500, capacity: 5000 },
          inServiceDate: '2025-09-02', termYears: 20, residualValue: 28000, financedAmount: 0 },

        { name: 'Indio — Desert Electric', utility: 'IID', stage: 'online', ownership: 'financed',
          bessKwh: 750, capex: 431000, incentive: 149000, annualRevenue: 47000, opex: 10600,
          opexLines: { om: 3900, insurance: 2000, monitoring: 1500, warranty: 2500, admin: 700 },
          revenueLines: { demand: 33000, energy: 7000, capacity: 7000 },
          inServiceDate: '2026-02-10', termYears: 20, residualValue: 40000,
          financedAmount: 200000, debtService: 29700 },

        { name: 'Anaheim Branch', utility: 'SCE', stage: 'construction', ownership: 'financed',
          bessKwh: 500, capex: 305000, incentive: 105000, annualRevenue: 32000, opex: 7400,
          revenueLines: { demand: 23000, energy: 4000, capacity: 5000 },
          termYears: 20, residualValue: 27000, financedAmount: 150000, debtService: 20300 },

        { name: 'Riverside Cold Storage (customer)', utility: 'SCE', stage: 'finance',
          ownership: 'under-offer', bessKwh: 2000, capex: 1120000, incentive: 395000,
          annualRevenue: 128000, opex: 27000, termYears: 20, residualValue: 105000 },

        { name: 'Pomona Wholesale Branch', utility: 'SCE', stage: 'permitting',
          ownership: 'pipeline', bessKwh: 500, capex: 298000, incentive: 102000,
          annualRevenue: 31000, opex: 7200, termYears: 20 }
      ],
      offers: [
        { partner: 'Coachella Capital Partners', projectName: 'Indio — Desert Electric',
          structure: 'debt', amount: 200000, rate: 0.079, termYears: 10,
          status: 'accepted', createdAt: '2026-06-18' },
        { partner: 'Pacific Tax Equity Fund II', projectName: 'Brea Distribution Center',
          structure: 'tax-equity', amount: 210000, rate: 0.065, termYears: 6,
          status: 'accepted', createdAt: '2026-05-04' },
        { partner: 'Harbor Infrastructure', projectName: 'Riverside Cold Storage (customer)',
          structure: 'sale-leaseback', amount: 890000, rate: 0.072, termYears: 15,
          status: 'reviewing', createdAt: '2026-08-06' },
        { partner: 'Meridian Energy Credit', projectName: 'Anaheim Branch',
          structure: 'debt', amount: 150000, rate: 0.084, termYears: 12,
          status: 'accepted', createdAt: '2026-07-21' },
        { partner: 'Westlake Storage Offtake', projectName: 'Riverside Cold Storage (customer)',
          structure: 'esa-ppa', amount: 640000, rate: 0.061, termYears: 12,
          status: 'countered', createdAt: '2026-08-11' },
        { partner: 'Sunbelt Equipment Finance', projectName: 'Pomona Wholesale Branch',
          structure: 'equipment', amount: 245000, rate: 0.091, termYears: 7,
          status: 'declined', createdAt: '2026-07-02' }
      ]
    };
  }

  /* ══════════════════════════════════════════════════════════════════════
     THE MATH
     ══════════════════════════════════════════════════════════════════════ */

  var OWNED = { owned: 1, financed: 1 };          // counts toward the asset book
  var LIVE_STAGES = { finance: 1, construction: 1, online: 1 };

  function ownershipOf(p) {
    if (p.ownership) return String(p.ownership).toLowerCase();
    return (p.stage === 'online') ? 'owned' : 'pipeline';   // documented inference
  }

  function analyse(data) {
    var C = cfg();
    var out = {
      sample: !!data.sample,
      /* offers */
      offersTotal: 0, offersOpen: 0, offersAccepted: 0, offersDeclined: 0,
      capitalOffered: 0, capitalAccepted: 0, offerWinRate: null,
      /* book */
      ownedCount: 0, grossCapex: 0, incentives: 0, netCapex: 0, bookValue: 0,
      financed: 0, equity: 0, ownedMwh: 0,
      /* committed but not yet earning */
      pendingCount: 0, pendingCapex: 0, pendingRevenue: 0,
      /* operations */
      revenue: 0, opex: 0, noi: 0, debtService: 0, netCash: 0,
      revLines: {}, opexLines: {}, opexItemized: false, revItemized: false,
      /* returns */
      avgIrr: null, simpleIrr: null, roi: null, cashOnCash: null, payback: null,
      /* lists */
      active: [], offers: []
    };

    /* ── Offers ─────────────────────────────────────────────────────── */
    var offers = (data.offers || []).slice().sort(function (a, b) {
      var da = dateOf(a.createdAt), dbb = dateOf(b.createdAt);
      return (dbb ? dbb.getTime() : 0) - (da ? da.getTime() : 0);
    });
    offers.forEach(function (o) {
      var st = String(o.status || 'received').toLowerCase();
      out.offersTotal++;
      out.capitalOffered += num(o.amount);
      if (st === 'accepted') { out.offersAccepted++; out.capitalAccepted += num(o.amount); }
      else if (st === 'declined' || st === 'expired') { out.offersDeclined++; }
      else { out.offersOpen++; }
    });
    var decided = out.offersAccepted + out.offersDeclined;
    if (decided > 0) out.offerWinRate = out.offersAccepted / decided;
    out.offers = offers;

    /* ── Projects ───────────────────────────────────────────────────── */
    var irrs = [], irrWeights = [], lifetimeCash = 0;
    var offersByProject = {};
    offers.forEach(function (o) {
      var key = (o.projectName || o.projectId || '').toLowerCase();
      if (key) offersByProject[key] = (offersByProject[key] || 0) + 1;
    });

    (data.projects || []).forEach(function (p) {
      var own = ownershipOf(p);
      var term = num(p.termYears) || C.termYears;
      var gross = num(p.capex);
      var inc = num(p.incentive);
      var net = Math.max(0, gross - inc);
      var rev = num(p.annualRevenue);
      var opx = num(p.opex);
      var ds = num(p.debtService);
      var annualNet = rev - opx;

      /* Per-project IRR: use the stated one if the model already produced it,
         otherwise build the cash flows and solve. */
      var pIrr = (p.irr != null) ? Number(p.irr) : null;
      if (pIrr == null && net > 0 && annualNet > 0) {
        var flows = [-net];
        for (var y = 1; y <= term; y++) {
          flows.push(y === term ? annualNet + num(p.residualValue) : annualNet);
        }
        pIrr = irr(flows);
      }
      var pRoi = (net > 0) ? ((annualNet * term + num(p.residualValue) - net) / net) : null;

      /* Energized = actually earning. A site under construction has capital
         committed to it but no revenue, and folding its modeled revenue into
         the P&L would overstate what the portfolio earns today. It shows up
         instead as a memo line. */
      var isd = dateOf(p.inServiceDate);
      var energized = (p.stage === 'online') || (isd && isd.getTime() <= Date.now());

      if (OWNED[own]) {
        out.ownedCount++;
        out.grossCapex += gross;
        out.incentives += inc;
        out.netCapex += net;
        out.financed += num(p.financedAmount);
        out.ownedMwh += energized ? num(p.bessKwh) / 1000 : 0;
        lifetimeCash += annualNet * term + num(p.residualValue);

        if (energized) {
          out.revenue += rev;
          out.opex += opx;
          out.debtService += ds;
        } else {
          out.pendingCount++;
          out.pendingCapex += net;
          out.pendingRevenue += rev;
        }

        /* Straight-line book value from in-service date. No date on the doc
           means we cannot depreciate it, so it sits at cost — visible in the
           footnote rather than silently assumed. */
        var age = yearsSince(p.inServiceDate);
        var remaining = (age > 0 && term > 0) ? Math.max(0, 1 - age / term) : 1;
        out.bookValue += net * remaining;

        if (pIrr != null) { irrs.push(pIrr); irrWeights.push(net); }

        /* Line items follow the same energized test as the totals, or the
           statement would not foot. */
        if (energized) {
          ['om', 'insurance', 'lease', 'monitoring', 'warranty', 'admin'].forEach(function (k) {
            var v = p.opexLines && num(p.opexLines[k]);
            if (v) { out.opexLines[k] = (out.opexLines[k] || 0) + v; out.opexItemized = true; }
          });
          ['demand', 'energy', 'capacity', 'services', 'offtake'].forEach(function (k) {
            var v = p.revenueLines && num(p.revenueLines[k]);
            if (v) { out.revLines[k] = (out.revLines[k] || 0) + v; out.revItemized = true; }
          });
        }
      }

      /* Active list: anything live or being financed, owned or not — this is
         the "what's moving right now" view, not the asset book. */
      if (LIVE_STAGES[p.stage] || OWNED[own] || own === 'under-offer') {
        out.active.push({
          name: p.name || 'Untitled',
          utility: p.utility || '—',
          stage: p.stage || 'candidate',
          ownership: own,
          mwh: num(p.bessKwh) / 1000,
          netCapex: net,
          noi: annualNet,
          irr: pIrr,
          roi: pRoi,
          offers: offersByProject[String(p.name || '').toLowerCase()] || 0
        });
      }
    });

    out.equity = Math.max(0, out.netCapex - out.financed);
    out.noi = out.revenue - out.opex;
    out.netCash = out.noi - out.debtService;

    /* Portfolio IRR: weighted by net capex, because a $1.1M site and a $300K
       site should not count the same. Simple mean is kept for the footnote. */
    if (irrs.length) {
      var wsum = 0, tot = 0, simple = 0;
      for (var i = 0; i < irrs.length; i++) { wsum += irrs[i] * irrWeights[i]; tot += irrWeights[i]; simple += irrs[i]; }
      out.avgIrr = tot > 0 ? wsum / tot : null;
      out.simpleIrr = simple / irrs.length;
    }
    if (out.netCapex > 0) out.roi = (lifetimeCash - out.netCapex) / out.netCapex;
    if (out.equity > 0) out.cashOnCash = out.netCash / out.equity;
    if (out.netCash > 0 && out.equity > 0) out.payback = out.equity / out.netCash;

    out.active.sort(function (a, b) { return b.netCapex - a.netCapex; });
    return out;
  }

  /* ══════════════════════════════════════════════════════════════════════
     RENDER
     Reuses the portal's own classes (.ov-strip / .kpi / .block-head) so this
     block is indistinguishable from the ones shipped in index.html. Only the
     genuinely new pieces — the P&L statement, the capital stack, the two
     tables — carry their own scoped CSS.
     ══════════════════════════════════════════════════════════════════════ */

  function injectStyles() {
    if (document.getElementById('oa-styles')) return;
    var s = document.createElement('style');
    s.id = 'oa-styles';
    s.textContent = [
      '#oa-block .oa-ribbon{display:flex;align-items:center;gap:9px;margin:0 0 12px;padding:9px 13px;',
        'border:1px solid #E3C77A;background:#FDF6E3;border-radius:10px;font-size:12.5px;color:#6B551C}',
      '#oa-block .oa-ribbon b{font-weight:700}',
      '#oa-block .oa-ribbon .oa-tag{background:#8A6D1F;color:#fff;border-radius:5px;padding:2px 7px;',
        'font-size:10px;font-weight:700;letter-spacing:.6px;text-transform:uppercase}',
      '#oa-block .oa-cols{display:grid;grid-template-columns:1.35fr 1fr;gap:14px;margin-top:14px}',
      '#oa-block .oa-card{background:#fff;border:1px solid var(--pol-border,#DCE3EA);border-radius:14px;',
        'padding:18px 20px;box-shadow:var(--pol-shadow,0 1px 3px rgba(20,40,60,.06))}',
      '#oa-block .oa-card-h{font-size:13px;font-weight:700;color:var(--sap-num,#12212E);',
        'letter-spacing:-.1px;margin-bottom:2px}',
      '#oa-block .oa-card-s{font-size:11px;color:var(--sap-ink-2,#6B7A88);margin-bottom:14px}',
      /* P&L statement */
      '#oa-block .pl{width:100%;border-collapse:collapse;font-size:12.5px}',
      '#oa-block .pl td{padding:6px 0;color:var(--sap-ink,#3E4C59)}',
      '#oa-block .pl td.n{text-align:right;font-variant-numeric:tabular-nums;font-weight:600;',
        'color:var(--sap-num,#12212E);white-space:nowrap}',
      '#oa-block .pl tr.sec td{padding-top:14px;font-size:10.5px;font-weight:700;letter-spacing:.6px;',
        'text-transform:uppercase;color:var(--sap-ink-2,#6B7A88)}',
      '#oa-block .pl tr.item td:first-child{padding-left:12px;color:var(--sap-ink-2,#6B7A88)}',
      '#oa-block .pl tr.tot td{border-top:1px solid var(--pol-border,#DCE3EA);padding-top:9px;font-weight:700;',
        'color:var(--sap-num,#12212E)}',
      '#oa-block .pl tr.bot td{border-top:2px solid var(--sap-num,#12212E);padding-top:9px;font-weight:700;font-size:13.5px}',
      '#oa-block .pl .neg{color:#B3261E}',
      '#oa-block .pl .pos{color:#1D7A3E}',
      /* capital stack */
      '#oa-block .stack{display:flex;height:26px;border-radius:7px;overflow:hidden;margin:4px 0 12px;',
        'border:1px solid var(--pol-border,#DCE3EA)}',
      '#oa-block .stack i{display:block;height:100%}',
      '#oa-block .stack-key{display:flex;flex-direction:column;gap:8px}',
      '#oa-block .stack-key div{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--sap-ink,#3E4C59)}',
      '#oa-block .stack-key span.sw{width:10px;height:10px;border-radius:3px;flex:0 0 auto}',
      '#oa-block .stack-key span.v{margin-left:auto;font-weight:700;font-variant-numeric:tabular-nums;',
        'color:var(--sap-num,#12212E)}',
      /* funnel */
      '#oa-block .fun{display:flex;flex-direction:column;gap:9px;margin-top:14px}',
      '#oa-block .fun-row{display:flex;align-items:center;gap:10px;font-size:12px;color:var(--sap-ink,#3E4C59)}',
      '#oa-block .fun-bar{flex:1;height:7px;background:#EDF1F5;border-radius:4px;overflow:hidden}',
      '#oa-block .fun-bar i{display:block;height:100%;background:var(--sap-blue,#0070F2);border-radius:4px}',
      '#oa-block .fun-n{width:26px;text-align:right;font-weight:700;color:var(--sap-num,#12212E);',
        'font-variant-numeric:tabular-nums}',
      /* tables */
      '#oa-block .oa-tbl{width:100%;border-collapse:collapse;font-size:12.5px}',
      '#oa-block .oa-tbl th{text-align:left;font-size:10.5px;font-weight:700;letter-spacing:.5px;',
        'text-transform:uppercase;color:var(--sap-ink-2,#6B7A88);padding:0 12px 9px 0;white-space:nowrap}',
      '#oa-block .oa-tbl td{padding:10px 12px 10px 0;border-top:1px solid #EDF1F5;color:var(--sap-ink,#3E4C59)}',
      '#oa-block .oa-tbl td.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}',
      '#oa-block .oa-tbl td.nm{font-weight:600;color:var(--sap-num,#12212E)}',
      '#oa-block .oa-tbl tr:hover td{background:#F7FAFC}',
      '#oa-block .chip{display:inline-block;padding:2px 8px;border-radius:20px;font-size:10.5px;',
        'font-weight:700;letter-spacing:.3px;white-space:nowrap}',
      '#oa-block .chip.owned{background:#E3F4E8;color:#1D7A3E}',
      '#oa-block .chip.financed{background:#E7F0FD;color:#0B4FA8}',
      '#oa-block .chip.under-offer{background:#FEF3E0;color:#8A5A00}',
      '#oa-block .chip.pipeline{background:#F0F2F5;color:#5C6B7A}',
      '#oa-block .chip.sold{background:#F4E7F5;color:#6B2A75}',
      '#oa-block .chip.accepted{background:#E3F4E8;color:#1D7A3E}',
      '#oa-block .chip.reviewing{background:#E7F0FD;color:#0B4FA8}',
      '#oa-block .chip.received{background:#E7F0FD;color:#0B4FA8}',
      '#oa-block .chip.countered{background:#FEF3E0;color:#8A5A00}',
      '#oa-block .chip.declined,#oa-block .chip.expired{background:#F0F2F5;color:#5C6B7A}',
      '#oa-block .oa-foot{font-size:11px;color:var(--sap-ink-2,#6B7A88);margin-top:12px;line-height:1.55}',
      '#oa-block .oa-empty{padding:26px 20px;text-align:center;color:var(--sap-ink-2,#6B7A88);font-size:13px;line-height:1.6}',
      '#oa-block .oa-empty a{color:var(--sap-blue,#0070F2);cursor:pointer;text-decoration:none;font-weight:600}',
      '@media(max-width:1100px){#oa-block .oa-cols{grid-template-columns:1fr}}',
      '@media(max-width:760px){#oa-block .oa-scroll{overflow-x:auto}#oa-block .oa-tbl{min-width:640px}}'
    ].join('');
    document.head.appendChild(s);
  }

  /* Where the Finance Marketplace tool lives, asked of the catalog rather
     than hard-coded, so a change upstream doesn't strand this link. */
  function marketplaceHref() {
    var C = cfg();
    try {
      if (global.OMEGATools && typeof OMEGATools.all === 'function') {
        var all = OMEGATools.all();
        for (var i = 0; i < all.length; i++) {
          if (all[i].key === C.marketplaceKey) {
            return (typeof OMEGATools.hrefFor === 'function')
              ? OMEGATools.hrefFor(all[i], ws()) : '/marketplace.html';
          }
        }
      }
    } catch (e) {}
    return '/marketplace.html';
  }

  function strip(a) {
    var C = cfg();
    var cells = [
      { l: C.offersLabel, v: String(a.offersTotal) },
      { l: 'Capital offered', v: money(a.capitalOffered) },
      { l: 'Assets on the books', v: money(a.bookValue) },
      { l: 'Average project IRR', v: a.avgIrr == null ? '—' : pct(a.avgIrr) },
      { l: 'Portfolio ROI', v: a.roi == null ? '—' : pct(a.roi, 0) }
    ];
    return cells.map(function (c) {
      return '<div class="ov-cell"><div class="ov-val">' + esc(c.v) + '</div>' +
             '<div class="ov-label">' + esc(c.l) + '</div></div>';
    }).join('');
  }

  function kpis(a) {
    var cards = [
      { l: 'Active projects',        v: String(a.active.length) },
      { l: 'Energized capacity',     v: a.ownedMwh.toFixed(1), u: 'MWh', c: 'blue' },
      { l: 'CapEx deployed (net)',   v: money(a.netCapex) },
      { l: 'Annual OpEx',            v: money(a.opex) },
      { l: 'Annual revenue',         v: money(a.revenue), c: 'green' },
      { l: 'Net operating income',   v: money(a.noi), c: 'green' },
      { l: 'Cash-on-cash return',    v: a.cashOnCash == null ? '—' : pct(a.cashOnCash) },
      { l: 'Equity payback',         v: a.payback == null ? '—' : a.payback.toFixed(1), u: 'yrs' }
    ];
    return cards.map(function (c) {
      return '<div class="kpi ' + (c.c || '') + '"><div class="kpi-label">' + esc(c.l) + '</div>' +
             '<div class="kpi-val">' + esc(c.v) +
             (c.u ? '<span class="unit">' + esc(c.u) + '</span>' : '') + '</div></div>';
    }).join('');
  }

  var REV_LABEL  = { demand: 'Demand-charge savings', energy: 'Energy arbitrage / TOU',
                     capacity: 'Capacity & incentive programs', services: 'Grid services',
                     offtake: 'Offtake / lease income' };
  var OPEX_LABEL = { om: 'O&M contract', insurance: 'Insurance', lease: 'Site lease / land',
                     monitoring: 'Monitoring & software', warranty: 'Warranty & augmentation reserve',
                     admin: 'Administration' };

  function pnl(a) {
    var r = [];
    r.push('<tr class="sec"><td>Revenue</td><td class="n">Annual</td></tr>');
    if (a.revItemized) {
      Object.keys(REV_LABEL).forEach(function (k) {
        if (a.revLines[k]) r.push('<tr class="item"><td>' + REV_LABEL[k] + '</td><td class="n">' + dollars(a.revLines[k]) + '</td></tr>');
      });
      var accounted = Object.keys(a.revLines).reduce(function (s, k) { return s + a.revLines[k]; }, 0);
      if (a.revenue - accounted > 1) r.push('<tr class="item"><td>Other / unallocated</td><td class="n">' + dollars(a.revenue - accounted) + '</td></tr>');
    } else {
      r.push('<tr class="item"><td>Operating revenue</td><td class="n">' + dollars(a.revenue) + '</td></tr>');
    }
    r.push('<tr class="tot"><td>Total revenue</td><td class="n">' + dollars(a.revenue) + '</td></tr>');

    r.push('<tr class="sec"><td>Operating expenses</td><td class="n"></td></tr>');
    if (a.opexItemized) {
      Object.keys(OPEX_LABEL).forEach(function (k) {
        if (a.opexLines[k]) r.push('<tr class="item"><td>' + OPEX_LABEL[k] + '</td><td class="n">(' + dollars(a.opexLines[k]) + ')</td></tr>');
      });
      var acc = Object.keys(a.opexLines).reduce(function (s, k) { return s + a.opexLines[k]; }, 0);
      if (a.opex - acc > 1) r.push('<tr class="item"><td>Other / unallocated</td><td class="n">(' + dollars(a.opex - acc) + ')</td></tr>');
    } else {
      r.push('<tr class="item"><td>Operating expenses</td><td class="n">(' + dollars(a.opex) + ')</td></tr>');
    }
    r.push('<tr class="tot"><td>Total OpEx</td><td class="n">(' + dollars(a.opex) + ')</td></tr>');

    r.push('<tr class="tot"><td>Net operating income</td><td class="n ' + (a.noi >= 0 ? 'pos' : 'neg') + '">' + dollars(a.noi) + '</td></tr>');
    r.push('<tr class="item"><td>Debt service</td><td class="n">(' + dollars(a.debtService) + ')</td></tr>');
    r.push('<tr class="bot"><td>Net cash flow</td><td class="n ' + (a.netCash >= 0 ? 'pos' : 'neg') + '">' + dollars(a.netCash) + '</td></tr>');

    r.push('<tr class="sec"><td>Capital account</td><td class="n">To date</td></tr>');
    r.push('<tr class="item"><td>Gross CapEx</td><td class="n">' + dollars(a.grossCapex) + '</td></tr>');
    r.push('<tr class="item"><td>Incentives &amp; credits captured</td><td class="n">(' + dollars(a.incentives) + ')</td></tr>');
    r.push('<tr class="tot"><td>Net CapEx invested</td><td class="n">' + dollars(a.netCapex) + '</td></tr>');
    r.push('<tr class="item"><td>Net book value (straight-line)</td><td class="n">' + dollars(a.bookValue) + '</td></tr>');

    /* Assets under construction earn nothing yet, so they are held out of the
       statement above and reported here instead. */
    if (a.pendingCount) {
      r.push('<tr class="sec"><td>Committed, not yet energized</td><td class="n">' +
             a.pendingCount + ' site' + (a.pendingCount === 1 ? '' : 's') + '</td></tr>');
      r.push('<tr class="item"><td>Net CapEx in construction</td><td class="n">' + dollars(a.pendingCapex) + '</td></tr>');
      r.push('<tr class="item"><td>Revenue when energized</td><td class="n">' + dollars(a.pendingRevenue) + '</td></tr>');
    }

    return '<table class="pl">' + r.join('') + '</table>';
  }

  function capitalStack(a) {
    var parts = [
      { l: 'Equity',                 v: a.equity,     c: '#12212E' },
      { l: 'Debt & leases',          v: a.financed,   c: '#0070F2' },
      { l: 'Incentives & credits',   v: a.incentives, c: '#2E9C3C' }
    ];
    var total = parts.reduce(function (s, p) { return s + p.v; }, 0);
    if (total <= 0) return '<div class="oa-empty">No capital deployed yet.</div>';

    var bar = parts.map(function (p) {
      return '<i style="width:' + ((p.v / total) * 100).toFixed(2) + '%;background:' + p.c + '"></i>';
    }).join('');
    var key = parts.map(function (p) {
      return '<div><span class="sw" style="background:' + p.c + '"></span>' + esc(p.l) +
             '<span class="v">' + money(p.v) + '</span></div>';
    }).join('');
    return '<div class="stack">' + bar + '</div><div class="stack-key">' + key + '</div>';
  }

  function funnel(a) {
    var rows = [
      { l: 'Received',  n: a.offersTotal },
      { l: 'In review', n: a.offersOpen },
      { l: 'Accepted',  n: a.offersAccepted },
      { l: 'Declined',  n: a.offersDeclined }
    ];
    var max = Math.max(1, a.offersTotal);
    return rows.map(function (r) {
      return '<div class="fun-row"><span style="width:78px">' + esc(r.l) + '</span>' +
             '<span class="fun-bar"><i style="width:' + ((r.n / max) * 100).toFixed(1) + '%"></i></span>' +
             '<span class="fun-n">' + r.n + '</span></div>';
    }).join('');
  }

  var STAGE_NAME = {
    candidate: 'Candidate', package: 'Site package', submitted: 'Submitted',
    interconnect: 'Interconnection', permitting: 'Permitting', finance: 'Finance ready',
    construction: 'Construction', online: 'Online'
  };
  var OWN_NAME = { owned: 'Owned', financed: 'Financed', 'under-offer': 'Under offer',
                   pipeline: 'Pipeline', sold: 'Sold' };
  var STRUCT_NAME = { debt: 'Debt', 'tax-equity': 'Tax equity', 'sale-leaseback': 'Sale-leaseback',
                      'esa-ppa': 'ESA / PPA', equipment: 'Equipment finance', equity: 'Equity' };

  function activeTable(a) {
    if (!a.active.length) {
      return '<div class="oa-empty">No active projects yet.<br>' +
             'Build one in the <a onclick="if(typeof openNewProjectModal===\'function\')openNewProjectModal(\'bess\')">BESS Site Map</a>, ' +
             'then tag it <b>ownership: owned</b> to bring it onto this book.</div>';
    }
    var head = '<tr><th>Project</th><th>Utility</th><th>Status</th><th>Stage</th>' +
               '<th style="text-align:right">Size</th><th style="text-align:right">Net CapEx</th>' +
               '<th style="text-align:right">Annual NOI</th><th style="text-align:right">IRR</th>' +
               '<th style="text-align:right">ROI</th><th style="text-align:right">Offers</th></tr>';
    var body = a.active.map(function (p) {
      return '<tr>' +
        '<td class="nm">' + esc(p.name) + '</td>' +
        '<td>' + esc(p.utility) + '</td>' +
        '<td><span class="chip ' + esc(p.ownership) + '">' + esc(OWN_NAME[p.ownership] || p.ownership) + '</span></td>' +
        '<td>' + esc(STAGE_NAME[p.stage] || p.stage) + '</td>' +
        '<td class="n">' + (p.mwh ? p.mwh.toFixed(1) + ' MWh' : '—') + '</td>' +
        '<td class="n">' + money(p.netCapex) + '</td>' +
        '<td class="n">' + money(p.noi) + '</td>' +
        '<td class="n">' + (p.irr == null ? '—' : pct(p.irr)) + '</td>' +
        '<td class="n">' + (p.roi == null ? '—' : pct(p.roi, 0)) + '</td>' +
        '<td class="n">' + (p.offers || '—') + '</td>' +
      '</tr>';
    }).join('');
    return '<div class="oa-scroll"><table class="oa-tbl"><thead>' + head + '</thead><tbody>' + body + '</tbody></table></div>';
  }

  function offersTable(a) {
    if (!a.offers.length) {
      return '<div class="oa-empty">No offers yet.<br>' +
             'Send a project to capital partners from the ' +
             '<a href="' + esc(marketplaceHref()) + '">Finance Marketplace</a> and they land here.</div>';
    }
    var head = '<tr><th>Partner</th><th>Project</th><th>Structure</th>' +
               '<th style="text-align:right">Amount</th><th style="text-align:right">Pricing</th>' +
               '<th style="text-align:right">Term</th><th>Status</th><th>Received</th></tr>';
    var body = a.offers.slice(0, 12).map(function (o) {
      var st = String(o.status || 'received').toLowerCase();
      return '<tr>' +
        '<td class="nm">' + esc(o.partner || '—') + '</td>' +
        '<td>' + esc(o.projectName || '—') + '</td>' +
        '<td>' + esc(STRUCT_NAME[o.structure] || o.structure || '—') + '</td>' +
        '<td class="n">' + money(o.amount) + '</td>' +
        '<td class="n">' + (o.rate ? pct(Number(o.rate), 2) : '—') + '</td>' +
        '<td class="n">' + (o.termYears ? o.termYears + ' yr' : '—') + '</td>' +
        '<td><span class="chip ' + esc(st) + '">' + esc(st.charAt(0).toUpperCase() + st.slice(1)) + '</span></td>' +
        '<td>' + esc(fmtDate(o.createdAt)) + '</td>' +
      '</tr>';
    }).join('');
    return '<div class="oa-scroll"><table class="oa-tbl"><thead>' + head + '</thead><tbody>' + body + '</tbody></table></div>';
  }

  function footnote(a) {
    var bits = [];
    bits.push('IRR is weighted by net CapEx' +
      (a.simpleIrr == null ? '' : ' (simple average ' + pct(a.simpleIrr) + ')') +
      '; ROI is modeled net cash over the asset life against net CapEx.');
    bits.push('Book value is straight-line from each asset\u2019s in-service date; assets with no date are carried at cost.');
    bits.push('Figures are modeled estimates for portfolio management, not audited financial statements or sealed engineering documents.');
    return bits.join(' ');
  }

  function render(a) {
    var C = cfg();
    var host = document.getElementById('oa-block');
    if (!host) return;

    var ribbon = a.sample
      ? '<div class="oa-ribbon"><span class="oa-tag">Sample</span>' +
        '<span>Illustrative portfolio \u2014 not your data. It disappears the moment a real project or offer exists for this workspace. ' +
        'Turn it off with <b>assets.sampleData: false</b> in /config.js.</span></div>'
      : '';

    var empty = (!a.active.length && !a.offers.length && !a.sample);

    host.innerHTML =
      '<div class="block-head">' +
        '<div>' +
          '<div class="block-title">' + esc(C.title) + '</div>' +
          '<div class="block-sub">Offers, book value and operating economics for the sites you own or finance</div>' +
        '</div>' +
        '<a class="view-all" href="' + esc(marketplaceHref()) + '">Open Finance Marketplace \u203A</a>' +
      '</div>' +
      ribbon +
      (empty
        ? '<div class="oa-card"><div class="oa-empty">Nothing on the book yet.<br>' +
          'Tag a project with <b>ownership: "owned"</b> and an <b>opex</b> figure, or request capital in the ' +
          '<a href="' + esc(marketplaceHref()) + '">Finance Marketplace</a> \u2014 offers and owned assets both report here.</div></div>'
        :
        '<div class="ov-strip">' + strip(a) + '</div>' +
        '<div class="kpi-grid" style="margin-top:14px">' + kpis(a) + '</div>' +
        '<div class="oa-cols">' +
          '<div class="oa-card">' +
            '<div class="oa-card-h">Portfolio P&amp;L</div>' +
            '<div class="oa-card-s">Annualized, across owned and financed assets</div>' +
            pnl(a) +
          '</div>' +
          '<div class="oa-card">' +
            '<div class="oa-card-h">Capital stack</div>' +
            '<div class="oa-card-s">How the net CapEx was funded</div>' +
            capitalStack(a) +
            '<div class="oa-card-h" style="margin-top:20px">Offer pipeline</div>' +
            '<div class="oa-card-s">' +
              (a.offerWinRate == null ? 'No decided offers yet'
                : 'Accepted ' + pct(a.offerWinRate, 0) + ' of decided offers \u00B7 ' +
                  money(a.capitalAccepted) + ' committed') +
            '</div>' +
            '<div class="fun">' + funnel(a) + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="oa-card" style="margin-top:14px">' +
          '<div class="oa-card-h">Active projects</div>' +
          '<div class="oa-card-s">Owned, financed, under offer, or in construction</div>' +
          activeTable(a) +
        '</div>' +
        '<div class="oa-card" style="margin-top:14px">' +
          '<div class="oa-card-h">Finance marketplace offers</div>' +
          '<div class="oa-card-s">Most recent first</div>' +
          offersTable(a) +
        '</div>' +
        '<div class="oa-foot">' + footnote(a) + '</div>'
      );
  }

  /* ── Mount ──────────────────────────────────────────────────────────── */

  function mount() {
    var C = cfg();
    if (!C.enabled || MOUNTED) return false;
    var hostRoot = document.getElementById('dev-fixed');
    if (!hostRoot) return false;

    injectStyles();
    var block = document.createElement('div');
    block.className = 'dash-block';
    block.id = 'oa-block';
    block.setAttribute('data-block', BLOCK_KEY);

    /* Sit directly under the requested block (My Applications by default) so
       the owner economics are above the fold. The dashboard's own edit mode
       can move or hide it afterwards like any other block. */
    var anchor = hostRoot.querySelector('.dash-block[data-block="' + C.insertAfter + '"]');
    if (anchor && anchor.nextSibling) hostRoot.insertBefore(block, anchor.nextSibling);
    else if (anchor) hostRoot.appendChild(block);
    else hostRoot.insertBefore(block, hostRoot.firstChild);

    MOUNTED = true;
    refresh();
    return true;
  }

  function refresh() {
    if (!MOUNTED) return Promise.resolve();
    var C = cfg();
    return fetchAll().then(function (data) {
      var empty = !(data.projects || []).length && !(data.offers || []).length;
      if (empty && C.sampleData) data = samplePortfolio();
      render(analyse(data));
    })['catch'](function (e) {
      console.error('[omega-assets] refresh failed', e);
      render(analyse({ projects: [], offers: [] }));
    });
  }

  /* The dashboard recomputes on sign-in, on scope changes and after ownership
     edits. Ride along with it rather than polling Firestore on a timer. */
  function hookRollup() {
    if (typeof global.computeLiveRollup !== 'function' || global.computeLiveRollup.__oa) return true;
    var orig = global.computeLiveRollup;
    var wrapped = function () {
      var r = orig.apply(this, arguments);
      try { refresh(); } catch (e) {}
      return r;
    };
    wrapped.__oa = true;
    global.computeLiveRollup = wrapped;
    return true;
  }

  /* index.html defines showApp/computeLiveRollup in an inline script further
     down the page, and OMEGA_WORKSPACE only exists after auth resolves. Poll
     briefly for both rather than assuming script order. */
  var tries = 0;
  function boot() {
    if (tries++ > 150) return;                       // ~60s, then give up quietly
    hookRollup();
    if (global.OMEGA_WORKSPACE && document.getElementById('dev-fixed')) {
      if (mount()) return;
    }
    setTimeout(boot, 400);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  /* Exposed for the console: OmegaAssets.render(OmegaAssets.analyse(data)) will
     repaint the block from any dataset, which is how you check a proposed
     schema change without writing to Firestore first. */
  global.OmegaAssets = {
    refresh:  refresh,
    analyse:  analyse,
    render:   render,
    sample:   samplePortfolio,
    irr:      irr
  };
})(window);
