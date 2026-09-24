/* ═══════════════════════════════════════════════════════════════════════════════
   POST /api/dealroom-refer  —  put a deal in a capital partner's deal room
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   WHAT "IN THEIR DEAL ROOM" ACTUALLY IS.
   Not room.forOrg. A partner's portal queries fin_projects three ways —
   status == 'open', awardedTo == me, and firstLookUids array-contains me —
   and the security rules allow exactly those. A deal marked only with
   room.forOrg is readable by nobody and appears in no list: the write would
   succeed and the partner would see nothing, which is the worst kind of
   working.

   So a referral is a FIRST-LOOK HOLD, the same mechanism Amperage Capital
   has: status 'exclusive', the partner's uids in firstLookUids, and a window
   in firstLookUntil. room.forOrg is still written, because the delivery
   tracker and dealroom-send.js read it — but it is the label, not the grant.

   Body: { orgKey, days?, projectId? | deal? }
     projectId  an existing projects/{id} — headline numbers are copied
     deal       explicit fields, for seeding a deal that has no project doc
   Returns: { dealId, orgKey, partners, until }

   STAFF ONLY. Referring a deal shows an outside firm a project and starts a
   clock on it; that is a ClearSky decision, not a tenant's.
   ═══════════════════════════════════════════════════════════════════════════════ */
'use strict';
var A = require('./_lib/admin');

var DAY = 86400000;
function clean(v, max) { return String(v == null ? '' : v).trim().slice(0, max || 200); }
function num(v) { var n = Number(v); return isFinite(n) ? n : null; }

/* The people who will actually be able to open it. An approved partner
   account at that org — nothing else grants the read. */
function partnerUids(db, orgKey) {
  return db.collection('fin_profiles').where('orgKey', '==', orgKey).get().then(function (snap) {
    var uids = [], names = [];
    snap.forEach(function (d) {
      var p = d.data() || {};
      if (p.role !== 'partner' && p.role !== 'admin') return;
      if (p.approved === false || p.suspended === true) return;
      uids.push(d.id); names.push(p.email || d.id);
    });
    return { uids: uids, names: names };
  });
}

/* Map a project document onto the fields the financing portal renders. Only
   what is actually on the project — an absent number stays null rather than
   becoming a zero somebody reads as a measurement. */
function fromProject(p, id) {
  var addr = clean(p.address || p.siteAddress, 300);
  return {
    name: clean(p.name || p.projectName || addr || id, 160),
    address: addr,
    city: clean(p.city, 80), state: clean(p.state || p.stateCode, 20),
    utility: clean(p.utility, 120),
    /* A typed figure wins; the sizing fills the gap when nobody typed one,
       so a project sized in the tool and never hand-entered does not reach
       the market as 0 MW. */
    mw: num(p.sizeMw != null ? p.sizeMw : p.mw) || sizedMw(p),
    mwh: num(p.sizeMwh != null ? p.sizeMwh : p.mwh) || sizedMwh(p),
    capexUsd: num(p.capexUsd) || sizedCapex(p),
    developer: clean(p.developer || p.orgName || p.orgId, 120),
    developerUid: clean(p.ownerUid || p.createdByUid, 128) || null,
    orgKey: clean(p.orgId, 120),
    projectId: id,
    /* The sizing the Battery Sizer or the site-map editor left on this
       project, WITH ITS BASIS. A megawatt figure on its own tells a capital
       partner nothing about whether it came from a year of interval data or
       one bill and an assumption, and those two underwrite differently.
       It is read, never recomputed, so the deal room cannot disagree with
       the tool the developer was looking at when they sent it. */
    sizing: sizingOf(p)
  };
}

var RESULT_FIELD = 'bessSizing';

function sizedMw(p) {
  var r = p && p[RESULT_FIELD];
  return r && num(r.powerKw) > 0 ? Math.round(num(r.powerKw) / 1000 * 1000) / 1000 : null;
}
function sizedMwh(p) {
  var r = p && p[RESULT_FIELD];
  return r && num(r.nameplateKwh) > 0 ? Math.round(num(r.nameplateKwh) / 1000 * 1000) / 1000 : null;
}
function sizedCapex(p) {
  var r = p && p[RESULT_FIELD];
  return r && num(r.capex) > 0 ? num(r.capex) : null;
}

/* How far a reader should trust the number, in words they already use. */
function sizingGrade(rec) {
  if (!rec) return null;
  if (rec.basis === 'interval') return 'measured';
  var m = num(rec.monthsAnalyzed) || 0;
  if (m >= 12) return 'twelve bills';
  if (m > 1) return 'partial year';
  return 'single bill';
}

function sizingOf(p) {
  var rec = p && p[RESULT_FIELD];
  if (!rec || !(num(rec.powerKw) > 0)) return null;
  return {
    bessKw:        num(rec.powerKw),
    bessKwh:       num(rec.nameplateKwh),
    bessDurationH: num(rec.durationH),
    capexUsd:      num(rec.capex),
    annualSavingsUsd: num(rec.annualSavings),
    paybackYr:     num(rec.paybackYr),
    basis:         clean(rec.basis, 24),
    grade:         sizingGrade(rec),
    confidence:    clean(rec.confidence, 80),
    months:        num(rec.monthsAnalyzed),
    engine:        clean(rec.engine, 60),
    at:            num(rec.at)
  };
}

module.exports = A.handler(function (req) {
  if (req.method !== 'POST') throw A.httpError(405, 'POST only');
  var b = req.body || {};

  return A.authenticate(req).then(function (caller) {
    if (!caller.staff) throw A.httpError(403, 'ClearSky staff only');

    /* See provision-partner: a token verifies without a service account, so
       without this the call dies on the write with a message about Firestore
       rather than about the credential that is missing. */
    if (typeof A.isDegraded === 'function' && A.isDegraded())
      throw A.httpError(503, 'FIREBASE_SERVICE_ACCOUNT is not set on the server, so Firestore is unreachable and nothing can be written. Set it in the Vercel project environment and redeploy. Nothing was changed.');

    var orgKey = clean(b.orgKey, 60).toLowerCase();
    if (!/^[a-z0-9-]{2,60}$/.test(orgKey)) throw A.httpError(400, 'a valid orgKey is required');
    var days = Math.max(1, Math.min(90, Number(b.days) || 14));
    if (!b.projectId && !b.deal) throw A.httpError(400, 'projectId or deal is required');

    var admin = A.admin, db = A.db();
    var FV = admin.firestore.FieldValue;

    return partnerUids(db, orgKey).then(function (who) {
      /* Refuse rather than write a hold nobody can open. A deal held for an
         org with no approved partner account is invisible to everyone and
         still off the market for the length of the window. */
      if (!who.uids.length)
        throw A.httpError(409, 'No approved capital-partner account at ' + orgKey
          + ' yet. Provision or approve one first, then refer the deal.');

      var base = b.projectId
        ? db.collection('projects').doc(clean(b.projectId, 200)).get().then(function (s) {
            if (!s.exists) throw A.httpError(404, 'project ' + b.projectId + ' not found');
            return fromProject(s.data() || {}, s.id);
          })
        : Promise.resolve(Object.assign(fromProject(b.deal || {}, ''), {
            projectId: clean((b.deal || {}).projectId, 200) || null }));

      return base.then(function (deal) {
        var now = Date.now();
        var doc = Object.assign({}, deal, {
          status: 'exclusive',
          outcome: 'active',
          firstLookOrgKey: orgKey,
          firstLookOrgName: clean(b.orgName, 160) || orgKey,
          firstLookUids: who.uids,
          firstLookDays: days,
          firstLookStartedAt: now,
          firstLookUntil: now + days * DAY,
          firstLookDecision: null,
          awardedTo: null,
          /* The delivery label. dealroom-send.js and the tracker read this;
             it does not grant the read, the uid array does. */
          room: { forOrg: orgKey, state: 'delivered', deliveredAt: FV.serverTimestamp(),
                  notifiedTo: who.names },
          referredBy: caller.email || 'clearsky',
          referredAt: FV.serverTimestamp(),
          createdAt: now
        });
        var ref = db.collection('fin_projects').doc();
        return ref.set(doc).then(function () {
          return { dealId: ref.id, orgKey: orgKey, partners: who.names,
                   until: new Date(now + days * DAY).toISOString().slice(0, 10),
                   name: doc.name };
        });
      });
    });
  });
});
