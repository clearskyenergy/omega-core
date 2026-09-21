/* ═══════════════════════════════════════════════════════════════════════════════
   POST /api/embed-layout   —  "show me it on my site", for a stranger
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   The middle of the funnel. /api/embed-size says how big; this says whether it
   plausibly fits in their yard, and draws it. It is the step that turns a
   calculator into something a manufacturer's customer remembers.

   Body: { key, address | { lat, lng }, sku, system:{kw,kwh},
           orderId?, usable?, setbackFt?, clearanceFt? }

   ─────────────────────────────────────────────────────────────────────────────
   THIS IS NOT /api/site-plan, AND IT MUST NOT BECOME IT
   ─────────────────────────────────────────────────────────────────────────────
   api/site-plan.js is the real constrained layout: it places the battery AND
   the switchgear AND routes the conduit, and it demands a surveyed parcel, a
   CONFIRMED service wall, reviewed obstacles and a documented clearance basis
   — returning `needs_input` rather than invent one. Pointing a public
   storefront at it would hand every visitor a list of evidence they have
   never heard of.

   So this answers the weaker question honestly: does a system this size fit in
   this yard, roughly, and what would that look like. _lib/site-fit.js does the
   geometry and ships a six-line `unverified` list that the caller must show.
   If anybody later asks to "just add the conduit route", the answer is no:
   that is site-plan's job and site-plan's evidence bar.

   ─────────────────────────────────────────────────────────────────────────────
   THE METERED CALL, AND WHO PAYS FOR IT
   ─────────────────────────────────────────────────────────────────────────────
   Everything else on the public surface is free to serve. This one is not:
   api/parcel.js reaches Regrid, which is billed per lookup. A storefront on
   the open internet pointed at a paid upstream with no account behind it is a
   bill waiting to happen, and "we'll watch it" is not a control.

   Three controls, and they are deliberately different in kind:

     1. A NAMED LEAD IS THE TICKET. When requireContactForLayout is on (the
        default) this refuses without an `orderId` — the receipt from an
        enquiry the customer has already filed through /api/embed-order. The
        row carries their name and email. So every lookup we pay for has
        produced a lead for the tenant, which is the entire commercial point:
        the spend and the value land in the same place.

     2. A DAILY CAP per org, in a Firestore transaction, same pattern as the
        order cap. Instance memory cannot hold a spend limit — every cold
        start would get a fresh allowance.

     3. THE CACHE, which api/parcel.js already keeps at about a metre. The
        same address twice costs nothing, so a customer reloading the page or
        dragging their yard around is free after the first call.

   The geocoder is free either way (_lib/geocode.js — Census, then Nominatim),
   so a mistyped address costs nothing and is answered plainly.

   ─────────────────────────────────────────────────────────────────────────────
   ONE IMPLEMENTATION OF THE PARCEL CHAIN
   ─────────────────────────────────────────────────────────────────────────────
   This calls api/parcel.js's own lookup through its `_helpers` seam rather
   than carrying a copy of the source order, the timeouts, the county extents
   and the "a source that failed is not 'no parcel'" rule. Cook County moved
   its layer in 2026; a second copy would have drifted, and the drifted one
   would have been the one serving the public.
   ═══════════════════════════════════════════════════════════════════════════════ */
'use strict';
var E = require('./_lib/embed');
var A = require('./_lib/admin');
var GEO = require('./_lib/geocode');
var FIT = require('./_lib/site-fit');
var PARCEL = require('./parcel');

var P = PARCEL._helpers;
var DAILY_PARCEL_DEFAULT = 40;
var LEAD_MAX_AGE_MS = 24 * 3600 * 1000;

function clean(v, max) { return String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max || 200); }
function num(v) { var n = Number(v); return isFinite(n) ? n : null; }

/* The product's footprint. Without it there is no study — and a default
   footprint would be a made-up number drawn to scale on a customer's own lot,
   which is the most convincing kind of wrong. */
function unitFrom(sf, sku) {
  var list = (Array.isArray(sf.products) ? sf.products : []).filter(function(p){return p&&p.active!==false&&p.kind!=='service'&&(p.category||'bess')==='bess';});
  var p = null;
  for (var i = 0; i < list.length; i++) {
    if (String(list[i].sku) === sku) { p = list[i]; break; }
  }
  if (!p) return { error: 'That product is not in this catalogue.' };
  var w = num(p.widthFt), d = num(p.depthFt);
  if (!(w > 0) || !(d > 0)) {
    return { error: 'This product has no footprint on file yet, so we cannot draw it to scale. '
                  + 'Ask us and we will send a site layout.' };
  }
  return { unit: { model: clean(p.name || p.sku, 120), widthFt: w, depthFt: d,
                   kw: num(p.kw), kwh: num(p.kwh) } };
}

/* The daily spend cap. Counts only calls that will actually reach upstream —
   a cache hit is free and must not consume somebody's allowance. */
function claimLookup(db, FV, orgId, cap) {
  var ref = db.collection('omega_orgs').doc(orgId).collection('storefront').doc('counters');
  var day = new Date().toISOString().slice(0, 10);
  return db.runTransaction(function (tx) {
    return tx.get(ref).then(function (s) {
      var d = s.exists ? (s.data() || {}) : {};
      var n = (d.parcelDay === day) ? (num(d.parcelLookups) || 0) : 0;
      if (n >= cap) {
        throw A.httpError(429, 'We have reached today\'s limit for site studies. '
          + 'Send us your address and we will do this by hand.');
      }
      tx.set(ref, { parcelDay: day, parcelLookups: n + 1, updatedAt: FV.serverTimestamp() }, { merge: true });
      return n + 1;
    });
  });
}

/* The enquiry receipt. Proves a named person asked for this before we spend.
   Checked against the org so one tenant's order id cannot unlock another
   tenant's lookups, and aged out so a receipt is not a permanent free pass. */
function checkLead(db, orgId, orderId) {
  return db.collection('orders').doc(orderId).get().then(function (s) {
    if (!s.exists) throw A.httpError(403, 'We could not match that request. Please start again.');
    var o = s.data() || {};
    if (String(o.orgId || '').toLowerCase() !== orgId) {
      throw A.httpError(403, 'We could not match that request. Please start again.');
    }
    var at = o.createdAt && o.createdAt.toDate ? o.createdAt.toDate().getTime() : 0;
    if (at && (Date.now() - at) > LEAD_MAX_AGE_MS) {
      throw A.httpError(410, 'That request has expired. Please start again.');
    }
    return o;
  });
}

module.exports = E.handler(function (req) {
  if (req.method !== 'POST') throw A.httpError(405, 'POST only');
  var b = req.body || {};

  /* 30/min, not 12. A customer nudging their yard around re-runs this on
     every pointerup, and that path almost always hits api/parcel.js's cache —
     so it costs CPU, not money, and throttling it at 12 punished exactly the
     engaged visitor this feature exists to create. The MONEY control is the
     daily parcel cap below, which counts only calls that reach upstream. */
  return E.resolve(req, { limit: 30, scope: 'storefront' }).then(function (ctx) {
    var db = A.db(), FV = A.FieldValue();
    return db.collection('omega_orgs').doc(ctx.orgId)
      .collection('storefront').doc('config').get().then(function (s) {
        var sf = s.exists ? (s.data() || {}) : {};
        if (sf.siteStudy === false) throw A.httpError(403, 'Site studies are not enabled here.');

        var sku = clean(b.sku, 64);
        if (!sku) throw A.httpError(400, 'Choose a product first.');
        var got = unitFrom(sf, sku);
        if (got.error) throw A.httpError(422, got.error);

        var orderId = clean(b.orderId, 120);
        var leadCheck = (sf.requireContactForLayout === false)
          ? Promise.resolve(null)
          : (orderId ? checkLead(db, ctx.orgId, orderId)
                     : Promise.reject(A.httpError(403, 'Tell us who you are first and we will draw this for your site.')));

        return leadCheck.then(function () {
          /* Where. A point beats an address: dragging the yard re-runs this,
             and re-geocoding an unchanged address every time is pointless. */
          var lat = num(b.lat), lng = num(b.lng);
          if (lat != null && lng != null) {
            if (!(lat >= -90 && lat <= 90) || !(lng >= -180 && lng <= 180)) {
              throw A.httpError(400, 'That location is not valid.');
            }
            return { lat: lat, lng: lng, matched: null, source: 'client-point' };
          }
          var address = clean(b.address, 300);
          if (address.length < 6) throw A.httpError(400, 'Enter the site address.');
          return GEO.geocode(address).then(function (hit) {
            if (!hit) {
              throw A.httpError(422, 'We could not find that address. Check it, or send it to us and '
                + 'we will look it up by hand.');
            }
            return hit;
          });
        }).then(function (at) {
          /* The parcel. Cache first — a hit costs nothing and must not spend
             anybody's daily allowance, which is why the claim is INSIDE the
             miss branch and not before it. */
          var key = P.cacheKey(at.lat, at.lng);
          return P.cached(key).then(function (hit) {
            if (hit) return { parcel: hit, cached: true };
            var cap = num(sf.dailyParcelCap) || DAILY_PARCEL_DEFAULT;
            return claimLookup(db, FV, ctx.orgId, cap).then(function () {
              var ent = { regrid: P.regridEntitled(ctx.billing) };
              return P.lookup({ orgId: ctx.orgId + ' (storefront)' }, ent, at.lat, at.lng)
                .then(function (out) {
                  if (!out.ok) return { parcel: out, cached: false };
                  return P.remember(key, out).then(function () { return { parcel: out, cached: false }; });
                });
            });
          }).then(function (r) {
            var parcel = r.parcel;
            if (!parcel || !parcel.ok || !Array.isArray(parcel.ring) || parcel.ring.length < 3) {
              /* An honest miss, not an error. Rural points and counties whose
                 GIS is down both land here, and neither is the customer's
                 fault or something they can fix by retrying. */
              return {
                ok: true, found: false,
                at: { lat: at.lat, lng: at.lng, matched: at.matched || null },
                reason: 'We could not find a parcel record at that address, so we cannot draw '
                      + 'your lot. Everything else still stands — send us a site plan or an '
                      + 'aerial and we will lay it out.',
                unverified: FIT.UNVERIFIED
              };
            }

            var study;
            try {
              study = FIT.study(parcel.ring, got.unit,
                { kw: num(b.system && b.system.kw), kwh: num(b.system && b.system.kwh) },
                {
                  /* The tenant's figures, not the customer's: a setback the
                     browser could choose is a setback that becomes zero. */
                  setbackFt: num(sf.setbackFt),
                  clearanceFt: num(sf.clearanceFt),
                  aisleFt: num(sf.aisleFt),
                  rowsPerBlock: num(sf.rowsPerBlock),
                  usable: b.usable && num(b.usable.w) ? {
                    x: num(b.usable.x) || 0, y: num(b.usable.y) || 0,
                    w: num(b.usable.w), h: num(b.usable.h)
                  } : null
                });
            } catch (e) {
              /* site-fit throws for geometry it will not reason about. That is
                 about the parcel record, not about the customer, so it is a
                 422 with the geometry's own message. */
              throw A.httpError(422, e.message || 'We could not use the parcel record at that address.');
            }

            /* ── RECORD IT ON THE LEAD ─────────────────────────────────────
               Whoever works this order needs to know what the customer was
               SHOWN — "5 units on a 3.6-acre lot in Springfield, and it fit"
               is the difference between a cold callback and an informed one.

               Written from the study THIS FUNCTION just computed, never from
               anything the browser reported, so the row carries our numbers.
               Best-effort: a failed write must not cost the customer their
               drawing, and the study is reproducible from the address anyway.
               Overwritten on each redraw, so the row reflects the LAST yard
               they settled on rather than every yard they tried. */
            if (orderId) {
              try {
                db.collection('orders').doc(orderId).update({
                  siteStudy: {
                    address: at.matched || clean(b.address, 300) || null,
                    lat: at.lat, lng: at.lng,
                    acres: study.parcelAcres,
                    zoning: clean(parcel.zoning, 60) || null,
                    sku: sku,
                    unitsNeeded: study.packing.unitsNeeded,
                    unitsThatFit: study.packing.unitsThatFit,
                    yardAcres: study.usable ? study.usable.acres : null,
                    yardChosenByCustomer: !!(study.usable && study.usable.source === 'customer'),
                    fits: study.fits,
                    setbackFt: study.assumptions.setbackFt,
                    clearanceFt: study.assumptions.clearanceFt,
                    aisleFt: study.assumptions.aisleFt,
                    at: new Date().toISOString()
                  },
                  updatedAt: FV.serverTimestamp()
                })['catch'](function (e) {
                  console.warn('[embed-layout] could not record the study on ' + orderId + ' —', e && e.message);
                });
              } catch (e) {}
            }

            return {
              ok: true, found: true,
              at: { lat: at.lat, lng: at.lng, matched: at.matched || null },
              /* Deliberately NOT echoed: the owner name and APN the parcel
                 record carries. This is a public page — telling a visitor who
                 owns a lot they typed the address of is a different product
                 with a different consent story. Acres and zoning are on the
                 drawing because they are about the land, not the person. */
              site: {
                acres: study.parcelAcres,
                zoning: clean(parcel.zoning, 60) || null,
                county: clean(parcel.county, 60) || null,
                source: clean(parcel.source, 20) || null
              },
              parcel: study.parcel,
              usable: study.usable,
              packing: study.packing,
              fits: study.fits,
              reason: study.reason,
              assumptions: study.assumptions,
              unverified: study.unverified
            };
          });
        });
      });
  });
});
