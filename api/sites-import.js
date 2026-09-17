/* ═══════════════════════════════════════════════════════════════════════════════
   POST /api/sites-import   —  bulk site upload into ONE portal, reviewed
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   The page parses the spreadsheet, maps the columns and shows the preview.
   THIS function is the only thing that writes the rows, because three
   invariants cannot be trusted to a browser:

     1. the siteId is `${orgId}:${sourceKey}` and a re-upload UPDATES
     2. attribution (who brought it) is REQUIRED per import and never
        overwritten on an existing site — same lock `deals` has
     3. every row lands review.state='pending'. Nothing imported is counted,
        shared or projected until a person accepts it on the page.

   Body:
     { orgId, portfolioId, source: 'csv'|'xlsx'|'feed'|'listings',
       fileName, vertical, origination: { partnerOrg },
       rows: [ { addr, city, state, zip, lat, lon, siteName, vertical, stage,
                 chargers, dcfcKw, l2Kw, totalKw, utilTercile, sourceKey,
                 ownerName, ownerMailing, ..., leaseUsdYr, revSharePct } ] }
     — at most 500 rows per call; the page batches.

   Reply:
     { importId, created, updated, refused: [{row, reason}], siteIds: [...] }

   Access: caller must canActInOrg(orgId) — own org, demo bucket, staff, or an
   org_members grant. That is what lets a JV member firm upload into 'osa',
   which has no sign-in domain of its own.

   Also, action:'review' { orgId, siteIds:[...], decision:'accept'|'reject',
   reason } flips review.state. Kept server-side so the acceptance stamps the
   reviewer from the token, not from the body.
   ═══════════════════════════════════════════════════════════════════════════════ */
'use strict';
var A = require('./_lib/admin');
var SP = require('./_lib/site-spine');

var MAX_ROWS = 500;
var ORG_RE = /^[a-z0-9][a-z0-9.-]{1,80}$/;

module.exports = A.handler(function (req) {
  if (req.method !== 'POST') throw A.httpError(405, 'POST only');
  var b = req.body || {};
  return A.authenticate(req).then(function (caller) {
    var orgId = String(b.orgId || '').toLowerCase();
    if (!ORG_RE.test(orgId)) throw A.httpError(400, 'orgId is required');
    return A.canActInOrg(caller, orgId).then(function (ok) {
      if (!ok) throw A.httpError(403, 'you are not entitled to act in ' + orgId);
      if (b.action === 'review') return review(caller, orgId, b);
      return importRows(caller, orgId, b);
    });
  });
});

function importRows(caller, orgId, b) {
  var db = A.db(), FV = A.FieldValue();
  var rows = Array.isArray(b.rows) ? b.rows : [];
  if (!rows.length) throw A.httpError(400, 'rows[] is empty');
  if (rows.length > MAX_ROWS) throw A.httpError(413, 'at most ' + MAX_ROWS + ' rows per call');

  var source = String(b.source || 'csv').toLowerCase();
  if (SP.SOURCES.indexOf(source) < 0) throw A.httpError(400, 'source must be one of ' + SP.SOURCES.join(', '));

  /* WHO BROUGHT IT. Refused if absent, exactly as ingest-data.js refuses a
     spreadsheet row with no originating organisation. */
  var partnerOrg = String((b.origination || {}).partnerOrg || '').toLowerCase();
  if (!ORG_RE.test(partnerOrg)) throw A.httpError(400, 'origination.partnerOrg (email domain of the firm that brought these sites) is required');

  var portfolioId = b.portfolioId ? String(b.portfolioId) : undefined;
  var now = new Date().toISOString();
  var importId = String(b.importId || (orgId + ':' + Date.now().toString(36)));
  var ctx = {
    orgId: orgId, portfolioId: portfolioId, source: source, importId: importId,
    fileName: b.fileName ? String(b.fileName).slice(0, 200) : undefined,
    uploadedBy: caller.email, uploadedAt: now,
    vertical: b.vertical ? String(b.vertical).toLowerCase() : undefined
  };

  /* The portfolio, if named, must exist and belong to this org. A typo here
     would file a hundred sites under a portfolio nobody can open. */
  var portfolioCheck = portfolioId
    ? db.collection('portfolios').doc(portfolioId).get().then(function (s) {
        if (!s.exists || s.data().orgId !== orgId) throw A.httpError(400, 'portfolio ' + portfolioId + ' does not belong to ' + orgId);
      })
    : Promise.resolve();

  return portfolioCheck.then(function () {
    var out = { importId: importId, created: 0, updated: 0, refused: [], siteIds: [] };
    var prepared = [], i, r;
    for (i = 0; i < rows.length; i++) {
      ctx.rowNumber = rows[i].__row || (i + 1);
      r = SP.siteFromRow(rows[i], ctx);
      if (!r.ok) { out.refused.push({ row: ctx.rowNumber, reason: r.reason }); continue; }
      prepared.push(r);
    }

    /* Sequential batches of 200. A transaction per row would be slow; a
       single 500-write batch is over Firestore's limit. */
    var sites = db.collection('sites');
    var refs = prepared.map(function (p) { return sites.doc(p.siteId); });
    return (refs.length ? db.getAll.apply(db, refs) : Promise.resolve([])).then(function (snaps) {
      var batch = db.batch(), n = 0, flushes = [];
      snaps.forEach(function (snap, idx) {
        var p = prepared[idx], doc = p.doc, ref = refs[idx];
        if (snap.exists) {
          var prev = snap.data();
          /* A re-upload refreshes the data. It does NOT reopen a review that
             was already decided, and it does NOT touch attribution. */
          delete doc.status;
          doc.updatedAt = FV.serverTimestamp();
          doc.provenance.previousImportId = prev.provenance && prev.provenance.importId || null;
          if (!prev.origination) doc.origination = origination(partnerOrg, caller, now);
          if (!prev.review) doc.review = { state: 'pending', since: now };
          batch.set(ref, doc, { merge: true });
          out.updated++;
        } else {
          doc.createdAt = FV.serverTimestamp();
          doc.updatedAt = FV.serverTimestamp();
          doc.createdBy = caller.email;
          doc.origination = origination(partnerOrg, caller, now);
          doc.participants = [{ org: partnerOrg, role: 'land_provider', addedAt: now }];
          doc.review = { state: 'pending', since: now };
          batch.set(ref, doc);
          out.created++;
        }
        out.siteIds.push(p.siteId);
        if (++n >= 200) { flushes.push(batch.commit()); batch = db.batch(); n = 0; }
      });
      if (n) flushes.push(batch.commit());
      return Promise.all(flushes);
    }).then(function () {
      /* The import receipt. "Which upload did this number come from" is the
         first question asked about a row that looks wrong. */
      return db.collection('site_imports').doc(importId).set({
        importId: importId, orgId: orgId, portfolioId: portfolioId || null, source: source,
        fileName: ctx.fileName || null, uploadedBy: caller.email, uploadedAt: now,
        partnerOrg: partnerOrg, rows: rows.length, created: out.created, updated: out.updated,
        refused: out.refused.length, siteIds: out.siteIds
      });
    }).then(function () {
      if (portfolioId) return bumpPortfolioCount(db, portfolioId, orgId);
    }).then(function () { return out; });
  });
}

function origination(partnerOrg, caller, now) {
  return { partnerOrg: partnerOrg, setBy: caller.email, setAt: now, lockedAt: null };
}

/* siteCount is a convenience for the tenant's portfolio list. It counts
   ACCEPTED sites only — pending rows are not yet in the portfolio. */
function bumpPortfolioCount(db, portfolioId, orgId) {
  return db.collection('sites').where('orgId', '==', orgId).where('portfolioId', '==', portfolioId).get()
    .then(function (q) {
      var accepted = 0; q.forEach(function (d) { if (SP.isShareable(d.data())) accepted++; });
      return db.collection('portfolios').doc(portfolioId).set({ siteCount: accepted, pendingCount: q.size - accepted, countedAt: new Date().toISOString() }, { merge: true });
    });
}

function review(caller, orgId, b) {
  var db = A.db(), FV = A.FieldValue();
  var ids = Array.isArray(b.siteIds) ? b.siteIds.map(String).slice(0, MAX_ROWS) : [];
  if (!ids.length) throw A.httpError(400, 'siteIds[] is empty');
  var decision = b.decision === 'reject' ? 'rejected' : b.decision === 'accept' ? 'accepted' : '';
  if (!decision) throw A.httpError(400, 'decision must be accept or reject');
  if (decision === 'rejected' && !String(b.reason || '').trim()) throw A.httpError(400, 'a reason is required to reject');

  var refs = ids.map(function (id) { return db.collection('sites').doc(id); });
  var now = new Date().toISOString(), touched = {}, out = { accepted: 0, rejected: 0, skipped: [] };
  return db.getAll.apply(db, refs).then(function (snaps) {
    var batch = db.batch(), n = 0;
    snaps.forEach(function (s) {
      if (!s.exists || s.data().orgId !== orgId) { out.skipped.push({ siteId: s.id, reason: 'not in ' + orgId }); return; }
      var upd = { review: { state: decision, by: caller.email, at: now, reason: String(b.reason || '') || null }, updatedAt: FV.serverTimestamp() };
      /* Acceptance is the site advancing on the strength of who brought it:
         attribution locks here, as a deal's does when it leaves `referred`. */
      if (decision === 'accepted' && s.data().origination && !s.data().origination.lockedAt) upd['origination.lockedAt'] = now;
      batch.update(s.ref, upd);
      out[decision]++;
      if (s.data().portfolioId) touched[s.data().portfolioId] = true;
      n++;
    });
    return n ? batch.commit() : null;
  }).then(function () {
    return Promise.all(Object.keys(touched).map(function (pid) { return bumpPortfolioCount(db, pid, orgId); }));
  }).then(function () { return out; });
}
