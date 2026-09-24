/* POST /api/dealroom-open — package a project into a capital partner's deal room.
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   Body: { dealId, forOrgId, forOrgName?, jvName?, jvKey? }

   ── WHY THIS IS A SERVER JOB ──
   The room is a fin_projects document, and that collection's create rule asks
   for a financing-portal profile with a sponsor role. That is correct for the
   financing portal, where a person files their own company's deals — and wrong
   for a joint venture, where the people doing the work are spread across
   several member companies and none of them should need a second account in a
   second product before they can hand something over.

   The Admin SDK bypasses rules, so authorisation is asserted HERE instead, and
   it is asserted against the workspace the person actually belongs to: an
   active omega_users record, or ClearSky staff. That is a narrower gate than
   the one it replaces, not a wider one — a financing-portal profile is
   self-serve by anybody with an email address, whereas membership of this
   workspace is granted.

   ── THE VENTURE IS THE SPONSOR ──
   OSA is several companies with no shared domain, so the sponsor recorded on
   the project is the venture and the individual is recorded beside it. Every
   other part of this platform derives an organisation from an email domain;
   that is exactly what cannot work here.

   ── IDEMPOTENT ──
   A deal that already has a room returns the room it has. Two people pressing
   the same button on the same morning should not produce two rooms, and a
   retry after a timeout should not either. */
'use strict';
var A = require('./_lib/admin');
/* The field the sizers write on the project. Named once, here and in
   omega-bess-result.js, so a rename cannot half-land. */
var RESULT_FIELD = 'bessSizing';

/* How much a reader should trust the number, in words they already use. A
   single bill is a screening estimate however good the engine is, and a
   deal room has to say so next to the figure rather than under it. */
function sizingGrade(rec) {
  if (!rec) return null;
  if (rec.basis === 'interval') return 'measured';
  var m = +rec.monthsAnalyzed || 0;
  if (m >= 12) return 'twelve bills';
  if (m > 1) return 'partial year';
  return 'single bill';
}

/* Mirrors STAGES in tenants/osa/portfolio-data.js. Duplicated deliberately:
   the client list is UI vocabulary and this is a gate, and a gate that reads
   its own rules from the thing it is gating is not a gate. If the pipeline
   changes, both move — the test is whether a project has really been through
   pre-development, and that answer cannot live only in a browser. */
var ORDER = ['referred', 'screening', 'qualified', 'pre_dev', 'permitting',
             'verified', 'marketplace', 'committed', 'funded', 'construction',
             'operating'];
var EXITS = ['dead', 'parked', 'reevaluate', 'discarded'];
var GATE  = 'pre_dev';

function rank(stage) {
  var i = ORDER.indexOf(String(stage || ''));
  return i < 0 ? -1 : i;
}

module.exports = A.handler(function (req) {
  if (req.method !== 'POST') throw A.httpError(405, 'POST only');
  var b = req.body || {};
  var dealId   = String(b.dealId || '').trim();
  var forOrgId = String(b.forOrgId || '').trim().toLowerCase();
  if (!dealId)   throw A.httpError(400, 'dealId required');
  if (!forOrgId) throw A.httpError(400, 'forOrgId required — who is it for?');

  return A.authenticate(req).then(function (caller) {
    var db = A.db(), FV = A.FieldValue();

    /* ── who may package ────────────────────────────────────────────── */
    return (caller.staff
              ? Promise.resolve(true)
              : db.collection('omega_users').doc(caller.uid).get().then(function (u) {
                  var d = u.exists ? (u.data() || {}) : null;
                  return !!d && d.status === 'active';
                })
           ).then(function (allowed) {
      if (!allowed) {
        throw A.httpError(403,
          'You are not an active member of this workspace, so you cannot package a '
          + 'project for a partner. Ask an administrator to activate your account.');
      }

      var dealRef = db.collection('deals').doc(dealId);
      return dealRef.get().then(function (snap) {
        if (!snap.exists) throw A.httpError(404, 'That project no longer exists.');
        var d = snap.data() || {};

        /* Already sent — hand back what exists rather than making a second. */
        if (d.dealRoomId) {
          return { ok: true, projectId: d.dealRoomId, already: true };
        }

        if (EXITS.indexOf(String(d.stage || '')) >= 0) {
          throw A.httpError(400, 'That project is closed, so it cannot go to a deal room.');
        }
        if (rank(d.stage) < rank(GATE)) {
          throw A.httpError(400,
            'That project has not been through pre-development yet, so there is nothing '
            + 'to fund. It is at ' + (d.stage || 'an unknown stage') + '.');
        }

        /* One extra read, and only when the deal names a project. Failure
           here is not failure of the deal room: a sizing that cannot be
           fetched means the room opens without it, which is exactly what
           happened before this existed. */
        var linkedProjectId = String(d.projectId || d.sourceProjectId || '').trim();

        var jvName = String(b.jvName || 'OSA').trim() || 'OSA';
        var jvKey  = String(b.jvKey  || 'osa').trim().toLowerCase() || 'osa';
        var forOrgName = String(b.forOrgName || forOrgId).trim();
        var now = Date.now();

        return (linkedProjectId
          ? db.collection('projects').doc(linkedProjectId).get()
              .then(function (ps) { return ps.exists ? (ps.data() || {})[RESULT_FIELD] : null; })
              .catch(function () { return null; })
          : Promise.resolve(null)
        ).then(function (sizing) {

        var payload = {
          name:        d.name || dealId,
          address:     d.address || '',
          state:       d.state || '',
          mw:          +d.sizeMw || 0,
          capexUsd:    +d.capexUsd || 0,
          stage:       d.stage || '',
          status:      'review',
          awardedTo:   null,
          /* The person who pressed it owns the record; the VENTURE is the
             sponsor on it. Both are true and they are different facts. */
          developerUid:  caller.uid,
          orgName:       jvName,
          sponsorKey:    jvKey,
          packagedBy:    caller.email || '',
          packagedByOrg: (String(caller.email || '').split('@')[1] || ''),
          sourceDealId:     dealId,
          sourceWorkspace:  jvKey,
          room: {
            state:       'ordered',
            /* forOrg is the DISPLAY NAME and forOrgId is the identifier.
               Only forOrgId is matchable: firestore.rules scopes a partner's
               deal room on it (deliveredToMyOrg), and the deal-room console
               warns when a display name has leaked into a key position. Keep
               them distinct — collapsing them empties somebody's room. */
            forOrg:      forOrgName,
            forOrgId:    forOrgId,
            dataRoomUrl: '',
            note:        '',
            history: [{ state: 'ordered', at: now, by: caller.email || '' }]
          },
          createdAt: FV.serverTimestamp(),
          updatedAt: FV.serverTimestamp()
        };

        /* Carry the sizing across, WITH ITS BASIS. A megawatt figure on
           its own tells a capital partner nothing about whether it came
           from a year of interval data or one bill and an assumption, and
           those two underwrite differently.

           The record is written onto the PROJECT by whichever sizer ran, so
           this path has to follow the link rather than look on the deal.
           A deal with no project named simply carries no sizing - the
           marketplace shows what a human typed, as it always did, and
           nothing is invented to fill the gap.

           It only ever FILLS. A figure already on the deal was put there by
           a person and a stored sizing does not get to overrule it. */
        if (sizing && +sizing.powerKw > 0) {
          payload.bessKw           = +sizing.powerKw || null;
          payload.bessKwh          = +sizing.nameplateKwh || null;
          payload.bessDurationH    = +sizing.durationH || null;
          payload.sizingBasis      = sizing.basis || null;
          payload.sizingGrade      = sizingGrade(sizing);
          payload.sizingConfidence = sizing.confidence || null;
          payload.sizingMonths     = +sizing.monthsAnalyzed || null;
          payload.sizingEngine     = sizing.engine || null;
          payload.sizingAt         = +sizing.at || null;
          if (sizing.annualSavings != null) payload.annualSavingsUsd = +sizing.annualSavings;
          if (sizing.paybackYr != null)     payload.paybackYr = +sizing.paybackYr;
          if (!payload.mw && sizing.powerKw) {
            payload.mw = Math.round(sizing.powerKw / 1000 * 1000) / 1000;
          }
          if (!payload.capexUsd && sizing.capex) payload.capexUsd = +sizing.capex;
        }

        var projRef = db.collection('fin_projects').doc();
        /* One batch: a room with no link back, or a deal pointing at a room
           that was never made, are both worse than a clean failure. */
        var batch = db.batch();
        batch.set(projRef, payload);
        batch.update(dealRef, {
          dealRoomId:  projRef.id,
          dealRoomOrg: forOrgId,
          dealRoomAt:  FV.serverTimestamp()
        });
        return batch.commit().then(function () {
          return { ok: true, projectId: projRef.id, sponsor: jvName, forOrg: forOrgName,
                   sizingCarried: !!(sizing && +sizing.powerKw > 0) };
        });
        });
      });
    });
  });
});
