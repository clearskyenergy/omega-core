/* POST /api/offer — price a capital partner's offer and file it.
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   Body, as a partner:
     { dealId, amount, instrument?, rate?, termYears?, expires?, conditions?,
       extraConditions?, notes?, docs?, dryRun? }
   Body, as ClearSky (re-price an offer that was filed while this was down):
     { dealId, partnerUid, reprice: true }

   ── WHY THE PRICE IS STAMPED HERE ──
   ClearSky's commission on a deal — a transaction fee built onto the price,
   a finders fee at NTP and COD, both, or neither — is set per partner on
   fin_orgs/{orgKey}.fees by an administrator. The portal shows the partner
   what their offer will cost as they type, but the number that gets invoiced
   has to come from a place the partner cannot edit. The rules refuse a
   partner any write to pricing on an offer; only this function, through the
   Admin SDK, puts it there, and it reads the schedule from the org record,
   never from the request.

   ── THE SAME GATE AS THE RULES ──
   Because the Admin SDK bypasses them, every condition the rules put on a
   partner's offer is re-asserted here: a partner account, approved and not
   suspended; a deal that is not awarded; and one of — the deal is open and
   this firm has unlocked it, it is held for this person and the window is
   live, or it was delivered into this firm's deal room. Getting this list
   wrong in either direction is worse than the feature: too loose files an
   offer the rules would have refused, too tight makes the button dead.

   ── DEGRADED ──
   Without FIREBASE_SERVICE_ACCOUNT this returns 503 and the portal files the
   offer directly with pricingPending:true, so a deal is never lost to a
   missing credential and the administrator sees exactly which offers still
   need a price. */
'use strict';
var A = require('./_lib/admin');
var FEES = require('../omega-fees.js');

var PRICING_KEYS = ['pricing', 'feesApplied', 'feesSet', 'pricedAt', 'pricedBy', 'pricingPending'];

function clean(v, max) { return String(v == null ? '' : v).trim().slice(0, max || 200); }
function num(v) { if (v == null || v === '') return null; var n = Number(v); return isFinite(n) ? n : null; }
function strList(v, maxItems, maxLen) {
  if (!Array.isArray(v)) return [];
  return v.map(function (x) { return clean(x, maxLen); }).filter(Boolean).slice(0, maxItems || 30);
}
/* Only https links, as the portal itself enforces: a pasted javascript: URL
   must never become a live anchor on somebody else's screen. */
function cleanLinks(v) {
  if (!Array.isArray(v)) return [];
  var out = [];
  v.forEach(function (l) {
    if (!l) return;
    var url = clean(l.url, 800), label = clean(l.label, 80) || 'Document';
    if (/^https:\/\//i.test(url)) out.push({ label: label, url: url });
  });
  return out.slice(0, 10);
}

/* Mirrors the offer create rule in firestore.rules, plus the deal-room
   delivery, which is an invitation the same way a hold is — and, like a hold,
   only while its window is live. Once a deal is OPEN it is open to every
   firm on the same terms, room or not: unlock it like anyone else. */
function mayOffer(deal, partner, uid, unlocked) {
  var status = String(deal.status || '');
  if (status === 'awarded') return { ok: false, status: 409, why: 'This deal has been awarded and is no longer taking offers.' };
  var room = deal.room || {};
  var roomForMe = !!(room.forOrgId && partner.orgId
                     && String(room.forOrgId).toLowerCase() === String(partner.orgId).toLowerCase());
  var uids = Array.isArray(deal.firstLookUids) ? deal.firstLookUids : [];
  var heldForMe = status === 'exclusive' && uids.indexOf(uid) >= 0;
  if (status !== 'open' && (heldForMe || roomForMe)) {
    var until = Number(deal.firstLookUntil) || 0;
    /* a hold always carries a clock; a room delivery may not, and then it
       stands until an administrator moves the deal */
    var live = until ? Date.now() < until : roomForMe;
    if (live) return { ok: true, via: heldForMe ? 'first-look' : 'room' };
    return { ok: false, status: 409, why: 'The first-look window on this deal has closed.' };
  }
  if (status === 'open') {
    if (unlocked) return { ok: true, via: 'open' };
    return { ok: false, status: 403, why: 'Unlock this deal before making an offer on it.' };
  }
  return { ok: false, status: 409, why: 'This deal is not open to offers from your firm.' };
}

module.exports = A.handler(function (req) {
  if (req.method !== 'POST') throw A.httpError(405, 'POST only');
  var b = req.body || {};
  var dealId = clean(b.dealId, 200);
  if (!dealId) throw A.httpError(400, 'dealId required');
  var reprice = b.reprice === true;

  return A.authenticate(req).then(function (caller) {
    if (typeof A.isDegraded === 'function' && A.isDegraded()) {
      throw A.httpError(503, 'FIREBASE_SERVICE_ACCOUNT is not set on the server, so the fee schedule cannot be read and the offer cannot be priced. Nothing was changed.');
    }
    var db = A.db();
    var targetUid = reprice ? clean(b.partnerUid, 128) : caller.uid;
    if (!targetUid) throw A.httpError(400, 'partnerUid required to re-price an offer');

    return Promise.all([
      db.collection('fin_profiles').doc(caller.uid).get(),
      (reprice && targetUid !== caller.uid) ? db.collection('fin_profiles').doc(targetUid).get() : Promise.resolve(null),
      db.collection('fin_projects').doc(dealId).get()
    ]).then(function (got) {
      var me = got[0].exists ? (got[0].data() || {}) : null;
      var isAdminHere = !!caller.staff || !!(me && me.role === 'admin');
      if (reprice && !isAdminHere) throw A.httpError(403, 'Only a ClearSky administrator can re-price an offer.');

      var partner = reprice ? (got[1] ? (got[1].exists ? (got[1].data() || {}) : null) : me) : me;
      if (!partner) throw A.httpError(403, 'No financing profile for this account.');
      if (partner.role !== 'partner') throw A.httpError(403, 'Only a capital partner account can make an offer.');
      if (partner.approved === false) throw A.httpError(403, 'This account is waiting for approval and cannot make offers yet.');
      if (partner.suspended === true) throw A.httpError(403, 'This account is suspended.');
      var orgKey = clean(partner.orgKey, 60).toLowerCase();
      if (!orgKey) throw A.httpError(409, 'This profile has no organisation key, so no fee schedule can be applied. Ask an administrator to set it.');

      if (!got[2].exists) throw A.httpError(404, 'That deal no longer exists.');
      var deal = got[2].data() || {};

      return Promise.all([
        db.collection('fin_orgs').doc(orgKey).get(),
        db.collection('fin_orgs').doc(orgKey).collection('unlocks').doc(dealId).get()
      ]).then(function (o) {
        var org = o[0].exists ? (o[0].data() || {}) : {};
        var unlocked = !!o[1].exists;
        var feesSet = org.fees != null;
        var fees = FEES.normalize(org.fees);
        var offerRef = db.collection('fin_projects').doc(dealId).collection('offers').doc(targetUid);

        if (reprice) {
          return offerRef.get().then(function (os) {
            if (!os.exists) throw A.httpError(404, 'There is no offer from that partner on this deal.');
            var cur = os.data() || {};
            var pricing = FEES.price(cur.amount, fees);
            var patch = { pricing: pricing, feesApplied: fees, feesSet: feesSet,
                          pricedAt: Date.now(), pricedBy: caller.email || 'clearsky', pricingPending: false };
            return offerRef.set(patch, { merge: true }).then(function () {
              return { ok: true, repriced: true, pricing: pricing, fees: fees, feesSet: feesSet, describe: FEES.describe(fees) };
            });
          });
        }

        var gate = mayOffer(deal, partner, targetUid, unlocked);
        if (!gate.ok) throw A.httpError(gate.status, gate.why);

        var amount = num(b.amount);
        if (!(amount > 0)) throw A.httpError(400, 'Enter the amount you are offering.');
        var pricing = FEES.price(amount, fees);

        if (b.dryRun) {
          return { ok: true, dryRun: true, pricing: pricing, fees: fees, feesSet: feesSet, describe: FEES.describe(fees), via: gate.via };
        }

        return offerRef.get().then(function (os) {
          var existed = os.exists;
          var body = {
            partnerUid: targetUid, uid: targetUid,
            dealId: dealId, dealName: clean(deal.name || dealId, 160),
            partnerName: clean(partner.name, 120),
            partnerOrg: clean(partner.org || org.name || orgKey, 120),
            partnerEmail: clean(partner.email, 160) || null,
            amount: pricing.offer,
            instrument: clean(b.instrument, 60) || null,
            rate: num(b.rate),
            termYears: num(b.termYears) != null ? Math.round(num(b.termYears)) : null,
            expires: clean(b.expires, 20) || null,
            conditions: strList(b.conditions, 30, 200),
            extraConditions: strList(b.extraConditions, 30, 300),
            notes: clean(b.notes, 2000),
            docs: cleanLinks(b.docs),
            status: 'submitted',
            updatedAt: Date.now(),
            /* the authoritative figure, and the schedule it came from */
            pricing: pricing, feesApplied: fees, feesSet: feesSet,
            pricedAt: Date.now(), pricedBy: 'server', pricingPending: false,
            via: gate.via
          };
          if (!existed) body.createdAt = Date.now();
          return offerRef.set(body, { merge: true }).then(function () {
            return { ok: true, offerId: targetUid, updated: existed, pricing: pricing, fees: fees,
                     feesSet: feesSet, describe: FEES.describe(fees), via: gate.via };
          });
        });
      });
    });
  });
});
module.exports.PRICING_KEYS = PRICING_KEYS;
module.exports.mayOffer = mayOffer;
