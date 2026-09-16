/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   OMEGA FEES — the commission ClearSky earns on a financing deal, as data.

   A capital partner's terms with ClearSky are set once, by a ClearSky
   administrator, on fin_orgs/{orgKey}.fees, and applied to every offer that
   partner makes. Two kinds of fee, either, both, or neither:

     transactionPct   a percentage of the offer, built onto the price the
                      partner pays at close.   Budderfly: 1% of the offer.
     finders[]        percentages of the offer invoiced at milestones.
                      Amperage Capital: 2.5% at NTP and 2.5% at COD.
     waived           no fee on this partner's deals.

   This file is loaded by the financing portal (to show a partner what an
   offer will cost them as they type) AND required by /api/offer.js (which
   stamps the authoritative figure on the offer). One implementation, so the
   number on screen is the number on the record. ES5, UMD, no dependencies. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.OmegaFees = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MILESTONES = ['NTP', 'COD', 'Close', 'Mechanical completion', 'Financial close', 'Custom'];

  function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }
  function pct(v) {
    var n = num(v);
    if (n < 0) n = 0;
    if (n > 100) n = 100;
    return Math.round(n * 1000) / 1000;
  }
  function round2(n) { return Math.round(num(n) * 100) / 100; }

  /* Whatever was stored or typed, made safe. Returns
       { waived, transactionPct, finders: [{ milestone, pct }], note }
     A schedule with no positive rate is a waiver, so "0% and no milestones"
     and "waived" read the same everywhere downstream. */
  function normalize(raw) {
    raw = raw || {};
    var finders = [];
    (Array.isArray(raw.finders) ? raw.finders : []).forEach(function (f) {
      if (!f) return;
      var p = pct(f.pct);
      var m = String(f.milestone == null ? '' : f.milestone).trim().slice(0, 40);
      if (p > 0 && m) finders.push({ milestone: m, pct: p });
    });
    var tx = pct(raw.transactionPct);
    var waived = raw.waived === true || (tx === 0 && !finders.length);
    return {
      waived: waived,
      transactionPct: waived ? 0 : tx,
      finders: waived ? [] : finders,
      note: String(raw.note == null ? '' : raw.note).trim().slice(0, 300)
    };
  }

  /* 'waived' | 'transaction' | 'finders' | 'both' */
  function mode(fees) {
    var f = normalize(fees);
    if (f.waived) return 'waived';
    if (f.transactionPct > 0 && f.finders.length) return 'both';
    if (f.transactionPct > 0) return 'transaction';
    return 'finders';
  }

  /* What an offer of `offer` dollars costs this partner, in cents.
       offer            what the sponsor receives
       transactionFee   built onto the price, due at close
       finders[]        each milestone's amount
       dueAtClose       offer + transaction fee
       total            offer + transaction fee + every milestone fee */
  function price(offer, fees) {
    var f = normalize(fees);
    var amt = Math.max(0, num(offer));
    var tx = round2(amt * f.transactionPct / 100);
    var finders = f.finders.map(function (m) {
      return { milestone: m.milestone, pct: m.pct, amount: round2(amt * m.pct / 100) };
    });
    var findersTotal = round2(finders.reduce(function (s, m) { return s + m.amount; }, 0));
    var findersPct = round2(f.finders.reduce(function (s, m) { return s + m.pct; }, 0));
    return {
      offer: round2(amt),
      mode: mode(f),
      waived: f.waived,
      transactionPct: f.transactionPct,
      transactionFee: tx,
      finders: finders,
      findersPct: findersPct,
      findersTotal: findersTotal,
      feesTotal: round2(tx + findersTotal),
      dueAtClose: round2(amt + tx),
      total: round2(amt + tx + findersTotal)
    };
  }

  /* One line a person can read: "Transaction fee 1% of the offer · Finders
     fee 2.5% at NTP, 2.5% at COD". */
  function describe(fees) {
    var f = normalize(fees);
    if (f.waived) return 'Fees waived';
    var parts = [];
    if (f.transactionPct > 0) parts.push('Transaction fee ' + f.transactionPct + '% of the offer');
    if (f.finders.length) {
      parts.push('Finders fee ' + f.finders.map(function (m) { return m.pct + '% at ' + m.milestone; }).join(', '));
    }
    return parts.join(' · ');
  }

  return { MILESTONES: MILESTONES, normalize: normalize, mode: mode, price: price, describe: describe };
});
