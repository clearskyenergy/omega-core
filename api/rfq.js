/* ═══════════════════════════════════════════════════════════════════════════════
   POST /api/rfq   —  Request for Quote from the BOM tool, fanned out to vendors
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   Body: { projectId, bom: [ { sku, description, qty, unit, category, vendorOrgId? } ], note? }

   ROUTING RULE (this is the IP; it lives here and nowhere in the browser):
     · every vendorOrgId appearing on a BOM line receives THAT vendor's lines
       (scope 'line-items'); lines without vendorOrgId are looked up in
       /equipment by sku;
     · every tenant with omega_orgs.receivesFullBom == true receives the
       WHOLE BOM (scope 'full-bom') — distributors such as Walters;
     · the customer's own org is never a recipient;
     · each recipient gets ONE doc under rfqs/{id}/recipients/{vendorOrgId}
       and reads only that — see firestore.rules.

   action: 'reveal'  { rfqId, vendorOrgId } — customer accepted this vendor's
   quote; writes the contact block onto that recipient doc only.
   ═══════════════════════════════════════════════════════════════════════════════ */
'use strict';
var A = require('./_lib/admin');

module.exports = A.handler(function (req) {
  if (req.method !== 'POST') throw A.httpError(405, 'POST only');
  var b = req.body || {};
  return A.authenticate(req).then(function (caller) {
    var db = A.db(), FV = A.FieldValue();
    if (b.action === 'reveal')  return reveal(caller, b, db, FV);
    if (b.action === 'respond') return respond(caller, b, db, FV);
    if (b.action === 'decide')  return decide(caller, b, db, FV);
    if (b.action === 'distributors') return distributors(caller, db);

    if (!b.projectId || !Array.isArray(b.bom) || !b.bom.length) throw A.httpError(400, 'projectId and a non-empty bom[] are required');
    return db.collection('projects').doc(String(b.projectId)).get().then(function (ps) {
      if (!ps.exists) throw A.httpError(404, 'project not found');
      var project = ps.data(), sourceOrgId = project.orgId;
      return A.canActInOrg(caller, sourceOrgId).then(function (ok) {
        if (!ok) throw A.httpError(403, 'not your project');
        /* 1 · resolve vendors for lines that don't name one */
        var lines = b.bom.map(function (l, i) { return { idx: i, sku: String(l.sku || ''), description: l.description || '', qty: Number(l.qty) || 1, unit: l.unit || 'ea', category: l.category || null, manufacturer: String(l.manufacturer || '') || null, vendorOrgId: l.vendorOrgId || null }; });
        var lookups = lines.filter(function (l) { return !l.vendorOrgId && l.sku; }).map(function (l) {
          return db.collection('equipment').where('key', '==', l.sku).limit(1).get().then(function (q) { if (!q.empty) { var e = q.docs[0].data(); l.vendorOrgId = e.vendorOrgId || null; l.category = l.category || e.category || null; } });
        });
        var sourceOrgName = '';
        return Promise.all(lookups).then(function () {
          /* ── THE BRAND FALLBACK ──────────────────────────────────────────
             The equipment lookup above only resolves a line whose catalogue
             key has a row in /equipment carrying vendorOrgId. The editor's
             SEED catalogue — where FENECON-IND-XXL and most of what people
             actually place lives — has no such rows, so before this every
             catalogue line failed to resolve and no OEM was ever routed an
             RFQ. The customer was told there was nobody to ask, about a
             drawing with that manufacturer's container on it.

             So: a line that names a brand and still has no vendor is matched
             against omega_orgs.brands[], lowercased. That puts the mapping on
             the tenant record — one field, editable in the master console —
             instead of requiring a catalogue row per SKU before a factory can
             be quoted. An /equipment row still wins when there is one; this
             only fills the gap. */
          var brands = {};
          lines.forEach(function (l) {
            if (l.vendorOrgId || !l.manufacturer) return;
            brands[String(l.manufacturer).trim().toLowerCase()] = 1;
          });
          var names = Object.keys(brands).filter(Boolean);
          if (!names.length) return null;
          return Promise.all(names.map(function (n) {
            return db.collection('omega_orgs').where('brands', 'array-contains', n).limit(1).get()
              .then(function (q) { if (!q.empty) brands[n] = q.docs[0].id; })
              ['catch'](function () {});
          })).then(function () {
            lines.forEach(function (l) {
              if (l.vendorOrgId || !l.manufacturer) return;
              var hit = brands[String(l.manufacturer).trim().toLowerCase()];
              if (hit && hit !== 1) l.vendorOrgId = hit;
            });
          });
        }).then(function () {
          /* 2 · full-BOM recipients, and the customer's own name — needed
             because a distributor quotes a named account, not a stranger. */
          return Promise.all([
            db.collection('omega_orgs').where('receivesFullBom', '==', true).get(),
            db.collection('omega_orgs').doc(sourceOrgId).get()
              .then(function (o) { return o.exists ? (o.data().name || '') : ''; })
              ['catch'](function () { return ''; })
          ]);
        }).then(function (got) {
          var q = got[0];
          sourceOrgName = got[1] || sourceOrgId;
          var recipients = {};
          /* ── THE CUSTOMER CHOOSES WHO SEES IT ──────────────────────────
             Fanning every RFQ to every distributor on the platform is not a
             quote request, it is a broadcast. When the caller names who it is
             for, only those are considered — and the flag still decides
             whether an org may receive a full BOM at all, so naming somebody
             who is not a distributor does not make them one.

             AN EMPTY LIST MEANS NONE, not "no preference". This read
             `&& b.toOrgIds.length`, so a customer who deliberately ticked no
             distributor — asking the manufacturers only — had their whole
             takeoff broadcast to every distributor on the platform instead.
             An absent field is the legacy caller with no opinion; an empty
             array is somebody who answered the question. */
          var only = Array.isArray(b.toOrgIds)
            ? b.toOrgIds.map(function (x) { return String(x || '').toLowerCase(); })
            : null;
          /* ── WHO THE MANUFACTURER IS SELLING THROUGH ────────────────────
             An OEM whose battery is on the drawing does not sell to the site,
             it sells through the distributor the customer picked — so a quote
             request that does not name that distributor gives the factory no
             point of contact and no idea whose account the order lands on.
             The selected distributors are recorded here and copied onto every
             MANUFACTURER's recipient doc below.

             Deliberately one direction. A manufacturer is told who is on the
             other side of its channel; a distributor is NOT told which other
             distributors are quoting the same package. Those two are bidding
             against each other, and who else was asked is the customer's to
             disclose, not ours. */
          var distList = [];
          q.docs.forEach(function (d) {
            if (d.id === sourceOrgId) return;
            if ((d.data().status || 'active') !== 'active') return;
            if (only && only.indexOf(d.id.toLowerCase()) < 0) return;
            recipients[d.id] = { scope: 'full-bom', lines: lines };
            distList.push({ orgId: d.id, name: d.data().name || d.id });
          });
          lines.forEach(function (l) {
            if (!l.vendorOrgId || l.vendorOrgId === sourceOrgId) return;
            if (recipients[l.vendorOrgId] && recipients[l.vendorOrgId].scope === 'full-bom') return;
            (recipients[l.vendorOrgId] = recipients[l.vendorOrgId] || { scope: 'line-items', lines: [] }).lines.push(l);
          });
          var ids = Object.keys(recipients);
          if (!ids.length) return { ok: true, rfqId: null, recipients: [], skipped: 'no routable vendors on this BOM' };

          /* 3 · write parent + one recipient doc each, atomically */
          var ref = db.collection('rfqs').doc();
          var anon = { state: project.state || (project.site && project.site.state) || null, utility: project.utility || null,
            sizeKw: project.sizeKw || null, sizeKwh: project.sizeKwh || null, stage: project.stage || 'design' };
          var batch = db.batch();
          /* Ship-to and the account number are what turn a parts list into a
             quotable order. A distributor prices against a branch and an
             account; without them they can only guess, and the quote comes
             back wrong or slow. */
          var ship = { zip: String(b.zip || '').trim() || null,
                       address: String(b.address || project.address || '').trim() || null,
                       state: anon.state || null };
          batch.set(ref, { sourceOrgId: sourceOrgId, projectId: String(b.projectId), projectName: project.name || project.title || null,
            bom: lines, note: b.note || null, status: 'open', recipientOrgIds: ids, requestedBy: caller.email,
            ship: ship, accounts: b.accounts || null,
            createdAt: FV.serverTimestamp(), updatedAt: FV.serverTimestamp() });
          ids.forEach(function (v) {
            /* ── ANONYMOUS TO A MANUFACTURER, NAMED TO A DISTRIBUTOR ──────
               A manufacturer is discovered by their own SKU appearing on
               somebody's drawing; they learn who it was when the customer
               accepts. A distributor was CHOSEN by name, and the customer
               handed over their account number with that distributor — an
               account that already carries their identity. Withholding the
               name at that point protects nobody and produces a quote
               against the wrong pricing tier. */
            var named = recipients[v].scope === 'full-bom';
            batch.set(ref.collection('recipients').doc(v), { vendorOrgId: v, scope: recipients[v].scope, lines: recipients[v].lines, anon: anon,
              ship: ship, projectName: named ? (project.name || project.title || null) : null,
              /* Manufacturers only — see distList above. */
              distributors: named ? null : distList,
              /* Each recipient sees only THEIR account number. A customer's
                 account with one distributor is not the other's business. */
              customerNumber: (b.accounts && b.accounts[v]) || null,
              contact: named ? { orgId: sourceOrgId, orgName: sourceOrgName || sourceOrgId, email: caller.email,
                                 projectId: String(b.projectId), projectName: project.name || project.title || null } : null,
              status: 'sent', quote: null, revealed: named, createdAt: FV.serverTimestamp(), updatedAt: FV.serverTimestamp() });
            batch.set(db.collection('omega_orgs').doc(v).collection('notifications').doc(), { text: 'New RFQ (' + recipients[v].lines.length + ' line' + (recipients[v].lines.length === 1 ? '' : 's') + ', ' + recipients[v].scope + ')', kind: 'rfq', rfqId: ref.id, read: false, createdAt: FV.serverTimestamp() });
          });
          return batch.commit().then(function () { return { ok: true, rfqId: ref.id, recipients: ids }; });
        });
      });
    });
  });
});

/* ── THE DISTRIBUTOR ANSWERS ────────────────────────────────────────────
   A quote comes back as a file and a number, not as a conversation. The file
   lives wherever the distributor already keeps it and we carry the link; the
   headline total and validity are stored so the customer can compare two
   quotes without opening either.

   Only the org the RFQ was actually sent to may answer, and only on their own
   recipient document — which is the whole reason the fan-out writes one doc
   per vendor rather than a list on the parent. */
function respond(caller, b, db, FV) {
  if (!b.rfqId || !b.vendorOrgId) throw A.httpError(400, 'rfqId and vendorOrgId required');
  var vendorOrgId = String(b.vendorOrgId).toLowerCase();
  var ref = db.collection('rfqs').doc(String(b.rfqId));
  var rec = ref.collection('recipients').doc(vendorOrgId);
  return A.canActInOrg(caller, vendorOrgId).then(function (ok) {
    if (!ok) throw A.httpError(403, 'This RFQ was not sent to your organisation.');
    return rec.get();
  }).then(function (s) {
    if (!s.exists) throw A.httpError(404, 'This RFQ was not sent to your organisation.');
    var url = String(b.fileUrl || '').trim();
    if (url && !/^https:\/\//i.test(url)) throw A.httpError(400, 'A quote link has to start with https://');
    if (!url && !b.note) throw A.httpError(400, 'Attach a quote or write a note — an empty answer is not an answer.');
    return rec.update({
      status: 'quoted',
      quote: {
        fileUrl:    url || null,
        fileName:   String(b.fileName || '').trim() || null,
        totalUsd:   (typeof b.totalUsd === 'number' && isFinite(b.totalUsd)) ? b.totalUsd : null,
        leadTimeDays: (typeof b.leadTimeDays === 'number' && isFinite(b.leadTimeDays)) ? b.leadTimeDays : null,
        validUntil: String(b.validUntil || '').trim() || null,
        note:       String(b.note || '').trim() || null,
        by:         caller.email,
        at:         Date.now()
      },
      updatedAt: FV.serverTimestamp()
    }).then(function () {
      /* Tell the customer's org, not the whole platform. */
      return ref.get().then(function (p) {
        var d = p.exists ? p.data() : {};
        if (!d.sourceOrgId) return { ok: true };
        return db.collection('omega_orgs').doc(d.sourceOrgId).collection('notifications').doc().set({
          text: 'Quote received on ' + (d.projectName || 'a project'),
          kind: 'rfq-quote', rfqId: String(b.rfqId), vendorOrgId: vendorOrgId,
          read: false, createdAt: FV.serverTimestamp()
        }).then(function () { return { ok: true }; });
      });
    });
  });
}

/* ── THE CUSTOMER DECIDES ───────────────────────────────────────────────
   Accept, ask a question, or decline. Declining takes a reason and the reason
   is optional on purpose: making somebody justify a no is how you stop getting
   honest ones, and a distributor would rather have a fast no than a slow
   explanation. Accepting reveals the customer's identity to that vendor and
   nobody else — see reveal(), which this defers to so there is one place that
   hands over contact details. */
var DECISIONS = { accepted: 1, inquiry: 1, rejected: 1 };
function decide(caller, b, db, FV) {
  if (!b.rfqId || !b.vendorOrgId) throw A.httpError(400, 'rfqId and vendorOrgId required');
  var decision = String(b.decision || '');
  if (!DECISIONS[decision]) throw A.httpError(400, 'decision must be accepted, inquiry or rejected');
  if (decision === 'accepted') return reveal(caller, b, db, FV);

  var vendorOrgId = String(b.vendorOrgId).toLowerCase();
  var ref = db.collection('rfqs').doc(String(b.rfqId));
  return ref.get().then(function (s) {
    if (!s.exists) throw A.httpError(404, 'rfq not found');
    var d = s.data();
    return A.canActInOrg(caller, d.sourceOrgId).then(function (ok) {
      if (!ok) throw A.httpError(403, 'only the customer can decide');
      var entry = { decision: decision, reason: String(b.reason || '').trim() || null,
                    by: caller.email, at: Date.now() };
      return ref.collection('recipients').doc(vendorOrgId).update({
        status: decision,
        decision: entry,
        updatedAt: FV.serverTimestamp()
      }).then(function () {
        return db.collection('omega_orgs').doc(vendorOrgId).collection('notifications').doc().set({
          text: (decision === 'inquiry' ? 'Question on your quote' : 'Quote declined')
              + ' — ' + (d.projectName || 'a project'),
          kind: 'rfq-' + decision, rfqId: String(b.rfqId),
          read: false, createdAt: FV.serverTimestamp()
        }).then(function () { return { ok: true, decision: decision }; });
      });
    });
  });
}

function reveal(caller, b, db, FV) {
  if (!b.rfqId || !b.vendorOrgId) throw A.httpError(400, 'rfqId and vendorOrgId required');
  var ref = db.collection('rfqs').doc(String(b.rfqId));
  return ref.get().then(function (s) {
    if (!s.exists) throw A.httpError(404, 'rfq not found');
    var d = s.data();
    return A.canActInOrg(caller, d.sourceOrgId).then(function (ok) {
      if (!ok) throw A.httpError(403, 'only the customer can reveal');
      return db.collection('omega_orgs').doc(d.sourceOrgId).get().then(function (o) {
        var org = o.exists ? o.data() : {};
        return ref.collection('recipients').doc(String(b.vendorOrgId)).update({ revealed: true, status: 'accepted',
          contact: { orgId: d.sourceOrgId, orgName: org.name || d.sourceOrgId, email: caller.email, projectId: d.projectId, projectName: d.projectName || null },
          updatedAt: FV.serverTimestamp() }).then(function () { return { ok: true }; });
      });
    });
  });
}

/* ── WHO MAY BE ASKED ───────────────────────────────────────────────────
   The BOM tool has to offer a choice of distributor, which means the browser
   needs the list — and the browser cannot query omega_orgs for it, because
   rules (correctly) refuse a cross-org read. So the list is assembled here
   and cut down to what a customer is entitled to know: a name and the id to
   address it by. Nothing about tier, arrangement, or anyone's billing goes
   over the wire; the routing decision itself still happens above. */
function distributors(caller, db) {
  return db.collection('omega_orgs').where('receivesFullBom', '==', true).get().then(function (q) {
    var out = [];
    q.docs.forEach(function (d) {
      if (d.id === caller.orgId) return;
      var v = d.data() || {};
      if ((v.status || 'active') !== 'active') return;
      out.push({ orgId: d.id, name: v.name || d.id });
    });
    out.sort(function (a, c) { return a.name.localeCompare(c.name); });
    return { ok: true, distributors: out };
  });
}
