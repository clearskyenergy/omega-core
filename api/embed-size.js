/* ═══════════════════════════════════════════════════════════════════════════════
   POST /api/embed-size
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   Sizes a system for a stranger on the tenant's own website, and returns a
   RESULT. This is the CLAUDE.md IP rule at its strictest, because the caller
   is a member of the public with our own page in front of them: every input
   they can see is one we chose to show them, and everything else is here.

   Body: {
     key,                                   // embed key (also X-Omega-Embed-Key)
     months: [ { demandKw, kwh, month? } ], // 1–12 rows off their utility bill
     demandChargePerKw?, energyRate?,       // THEIR tariff, off THEIR bill
     backupHours?                           // optional resilience ask
   }

   ── WHAT GOES OUT, AND WHAT CANNOT ───────────────────────────────────────
   OUT:  kW, kWh, duration, the duration sensitivity band, which published
         products fit, and — only when the storefront opts in — an annual
         saving computed from the tariff the customer themselves typed.

   NEVER OUT:  capexPerKwh, capexPerKw, or anything derived from them.

   That second list is not squeamishness. The sweep in _lib/bess-engine.js
   CHOOSES a recommendation by economics, so it needs an installed-cost
   assumption to run — and that assumption is the tenant's negotiated buy
   price. summarize() hands back capex and paybackYr, both of which invert
   straight back to it: one division and a competitor reading our public JSON
   knows what Clean Cell pays per kWh. So the engine gets the number, the
   response does not, and `sensitivity` is rebuilt here with the capex column
   dropped rather than forwarded.

   When a storefront DOES want to show payback, it is computed from the
   PUBLISHED LIST PRICE of the matched product — a number the tenant has
   already chosen to print in public — and never from the cost basis. Hence
   `priceBasis` on the way out: a reader can always tell which happened.
   ═══════════════════════════════════════════════════════════════════════════════ */
'use strict';
var E = require('./_lib/embed');
var A = require('./_lib/admin');
var engine = require('./_lib/bess-engine');
/* The ranking is pure and dependency-free, so it lives on its own and
   scripts/preview-storefront.js can require it without dragging in
   firebase-admin. One implementation; a second would drift and the
   drifted one would be the one people look at. */
var FIT = require('./_lib/product-fit');
var fitProducts = FIT.fitProducts;

var MAX_MONTHS = 12;

function num(v) { var n = Number(v); return isFinite(n) ? n : null; }
function pos(v) { var n = num(v); return (n != null && n > 0) ? n : null; }

/* Validated before the engine sees it. The engine validates too, but its
   messages are written for a signed-in designer; a stranger gets a sentence
   that tells them which box to fix. */
function readMonths(raw) {
  if (!Array.isArray(raw) || !raw.length) {
    throw A.httpError(400, 'Enter at least one month from your utility bill.');
  }
  if (raw.length > MAX_MONTHS) {
    throw A.httpError(400, 'Twelve months is the most this can take.');
  }
  return raw.map(function (r, i) {
    var demandKw = num(r && r.demandKw);
    var kwh = num(r && r.kwh);
    if (demandKw == null || demandKw < 0) {
      throw A.httpError(400, 'Month ' + (i + 1) + ': peak demand must be a number in kW.');
    }
    if (kwh == null || kwh < 0) {
      throw A.httpError(400, 'Month ' + (i + 1) + ': usage must be a number in kWh.');
    }
    if (demandKw > 500000 || kwh > 500000000) {
      throw A.httpError(400, 'Month ' + (i + 1) + ': that is larger than this tool handles — talk to us directly.');
    }
    return { month: (r.month != null ? r.month : i), demandKw: demandKw, kwh: kwh };
  });
}

module.exports = E.handler(function (req) {
  if (req.method !== 'POST') throw A.httpError(405, 'POST only');
  var b = req.body || {};

  /* A tighter limit than embed-config: this one runs a year-long dispatch. */
  return E.resolve(req, { limit: 30, scope: 'storefront' }).then(function (ctx) {
    var months = readMonths(b.months);

    var db = A.db();
    return db.collection('omega_orgs').doc(ctx.orgId)
      .collection('storefront').doc('config').get().then(function (s) {
        var sf = s.exists ? (s.data() || {}) : {};

        /* The customer's own tariff, bounded to sane ranges. Theirs to give;
           ours to sanity-check, because a pasted 18000 $/kW produces a
           confident answer that is nonsense. */
        var demandCharge = pos(b.demandChargePerKw);
        if (demandCharge != null && demandCharge > 200) {
          throw A.httpError(400, 'Demand charge looks wrong — enter $/kW-month, usually $5–$40.');
        }
        var energyRate = pos(b.energyRate);
        if (energyRate != null && energyRate > 2) {
          throw A.httpError(400, 'Energy rate looks wrong — enter $/kWh, usually $0.06–$0.40.');
        }

        /* THE COST BASIS. Read from the tenant's record, never from the
           request — a client that could set capexPerKwh could solve for the
           one we use by bisection. */
        var tariff = {};
        if (demandCharge != null) tariff.demandChargePerKw = demandCharge;
        if (energyRate != null) tariff.energyRate = energyRate;
        if (pos(sf.capexPerKwh)) tariff.capexPerKwh = pos(sf.capexPerKwh);
        if (pos(sf.capexPerKw)) tariff.capexPerKw = pos(sf.capexPerKw);

        var opts = { tariff: tariff };
        if (pos(b.backupHours)) opts.peakHours = Math.min(12, pos(b.backupHours));

        var res = engine.sizeFromMonthly(months, opts);
        if (!res || !res.ok) {
          throw A.httpError(422, (res && res.error) || 'Those numbers do not size a system — check the peak demand values.');
        }
        var sum = engine.summarize(res);
        if (!sum) throw A.httpError(422, 'Those numbers do not size a system.');

        /* Rebuilt, not forwarded: res.sensitivity carries a capex column. */
        var band = (res.sensitivity || []).map(function (r) {
          return { hours: r.hours, nameplateKwh: r.nameplateKwh };
        });

        var products = (Array.isArray(sf.products) ? sf.products : []).filter(function(p){return p&&p.active!==false&&p.kind!=='service'&&(p.category||'bess')==='bess';});
        var fits = fitProducts(products, sum.kw, sum.kwh).map(function (f) {
          var p = f.p;
          return {
            sku: String(p.sku || ''), name: String(p.name || p.sku || ''),
            kw: num(p.kw), kwh: num(p.kwh),
            priceMode: p.priceMode === 'list' ? 'list' : 'quote',
            listPrice: p.priceMode === 'list' ? num(p.listPrice) : null,
            /* The quantity that covers BOTH axes — computed once, in
               fitProducts, so the number shown and the number ranked on are
               the same number. */
            qty: f.qty,
            totalKw: Math.round(f.totKw), totalKwh: Math.round(f.totKwh)
          };
        });

        /* ── ECONOMICS, ON PUBLISHED NUMBERS ONLY ─────────────────────────
           savingsYr comes off the customer's own tariff and their own billed
           peaks; telling them what their own bill would do is not our IP.
           paybackYr needs a price, and the only price allowed here is one
           the tenant has already published. No list price, no payback — and
           priceBasis says so rather than leaving a blank to be guessed at. */
        var economics = null;
        if (sf.showEconomics === true) {
          var listed = fits.filter(function (f) { return f.priceMode === 'list' && f.listPrice; })[0];
          var price = listed ? listed.listPrice * listed.qty : null;
          economics = {
            savingsYr:  Math.round(sum.savingsYr || 0),
            paybackYr:  price ? +(price / Math.max(1, sum.savingsYr || 0)).toFixed(1) : null,
            priceBasis: price ? 'published-list-price' : 'none'
          };
        }

        return {
          ok: true,
          system: {
            kw: sum.kw, kwh: sum.kwh, durationH: sum.durationH,
            basis: sum.basis, confidence: sum.confidence,
            assumedDuration: sum.assumedDuration,
            feasible: sum.feasible
          },
          sensitivity: band,
          products: fits,
          economics: economics,
          /* Echoed so the order call can be checked against what the
             customer was actually shown, rather than trusting the browser to
             report its own arithmetic. */
          sizingToken: {
            kw: sum.kw, kwh: sum.kwh,
            months: months.length,
            at: new Date().toISOString()
          }
        };
      });
  });
});
