/* ═══════════════════════════════════════════════════════════════════════════════
   POST /api/order-link
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   THE HANDOFF. A designer at a white-label tenant builds a project in the
   editor; this turns that design into a link their customer can order from,
   on their own website, with no account and no sign-in.

   It closes the loop the storefront leaves open. /api/embed-size lets a
   stranger size their own system from a bill — good for a lead, wrong for a
   real project, because nothing a web form derives should become an order for
   a 2 MWh system. This is the other direction: an engineer decided the
   configuration, and the customer is ACCEPTING it, not specifying it.

   Body (create):
     { projectId?, label, system:{kw,kwh,durationH}, items:[{sku,qty}],
       expiresInDays?, note? }
   Body (withdraw):
     { action:'revoke', configId }

   ── A SNAPSHOT, NOT A POINTER ────────────────────────────────────────────
   The configuration is COPIED into embed_configs, not referenced back to the
   project. Three reasons, in order of how much they hurt:

     1. A project keeps being edited. A link that silently re-priced itself
        because somebody swapped an inverter is a link you cannot honour.
     2. embed_configs is read by an UNAUTHENTICATED caller. If it pointed at
        a project, serving it would mean reading a project for a stranger,
        and there is no version of that which stays safe for long.
     3. The snapshot is the evidence of what was offered, which is what you
        want when a customer says they ordered something else.

   projectId is recorded for provenance — so an order traces back to the
   design — and is never read on the public path.

   ── EXPIRY IS NOT OPTIONAL ───────────────────────────────────────────────
   A quote with no end date is a standing offer. Default 30 days, capped at
   180. The link stops working; it does not start costing different money.
   ═══════════════════════════════════════════════════════════════════════════════ */
'use strict';
var A = require('./_lib/admin');

var DEFAULT_DAYS = 30;
var MAX_DAYS = 180;
var MAX_ITEMS = 40;

function clean(v, max) { return String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max || 200); }
function num(v) { var n = Number(v); return isFinite(n) ? n : null; }

module.exports = A.handler(function (req) {
  if (req.method !== 'POST') throw A.httpError(405, 'POST only');
  var b = req.body || {};

  return A.authenticate(req).then(function (caller) {
    var db = A.db(), FV = A.FieldValue();

    if (b.action === 'revoke') return revoke(caller, b, db, FV);

    /* Which org is this for? A project's owner when a project is named —
       so a collaborator on a JDA cannot publish an order link against
       somebody else's project — otherwise the caller's own org. */
    var orgLoad = b.projectId
      ? db.collection('projects').doc(clean(b.projectId, 120)).get().then(function (ps) {
          if (!ps.exists) throw A.httpError(404, 'project not found');
          return { orgId: String((ps.data() || {}).orgId || '').toLowerCase(), project: ps.data() };
        })
      : Promise.resolve({ orgId: caller.orgId, project: null });

    return orgLoad.then(function (found) {
      var orgId = found.orgId;
      if (!orgId) throw A.httpError(400, 'that project has no orgId');

      return A.canActInOrg(caller, orgId).then(function (ok) {
        if (!ok) throw A.httpError(403, 'not your project');

        return Promise.all([
          db.collection('omega_orgs').doc(orgId).get(),
          db.collection('omega_orgs').doc(orgId).collection('storefront').doc('config').get(),
          /* The publishable key to put in the link. Publishable is the point:
             it is already in the page source of every storefront this tenant
             runs, so handing it back to the tenant's own designer discloses
             nothing. An org with no key cannot be handed a working link, and
             is told so rather than given a broken one. */
          db.collection('embed_keys').where('orgId', '==', orgId).where('active', '==', true).limit(1).get()
        ]).then(function (r) {
          var org = r[0].exists ? (r[0].data() || {}) : {};
          var sf = r[1].exists ? (r[1].data() || {}) : {};
          var keys = r[2];

          var wl = org.whiteLabel || {};
          if (wl.enabled !== true) {
            throw A.httpError(403, 'order links are part of the white-label storefront, which is not enabled on this account');
          }
          if (keys.empty) {
            throw A.httpError(409, 'this workspace has no active storefront key yet — ClearSky creates one with scripts/seed-embed-key.js');
          }
          var key = keys.docs[0].id;

          /* Items are re-read from the published catalogue by SKU, exactly as
             /api/embed-order does, for the same reason: the price on the
             customer's screen has to come from the place the tenant publishes
             prices, not from whatever the designer's browser sent. */
          var published = Array.isArray(sf.products) ? sf.products : [];
          function bySku(sku) {
            for (var i = 0; i < published.length; i++) if (String(published[i].sku) === sku) return published[i];
            return null;
          }

          var items = [];
          (Array.isArray(b.items) ? b.items : []).slice(0, MAX_ITEMS).forEach(function (it) {
            var sku = clean(it && it.sku, 64);
            if (!sku) return;
            var p = bySku(sku);
            items.push({
              sku: sku,
              name: clean((p && p.name) || (it && it.name) || sku, 120),
              qty: Math.max(1, Math.min(9999, num(it && it.qty) || 1)),
              kw: p ? num(p.kw) : num(it && it.kw),
              kwh: p ? num(p.kwh) : num(it && it.kwh),
              listPrice: (p && p.priceMode === 'list') ? num(p.listPrice) : null,
              /* An item the tenant has NOT published is still allowed onto a
                 designed configuration — an engineer may specify something
                 that is not in the web catalogue — but it is marked, so the
                 order page shows "price on request" rather than a blank. */
              published: !!p
            });
          });
          if (!items.length && !(b.system && num(b.system.kw))) {
            throw A.httpError(400, 'a configuration needs either a system size or at least one item');
          }

          var days = Math.max(1, Math.min(MAX_DAYS, num(b.expiresInDays) || DEFAULT_DAYS));
          var expiresAt = new Date(Date.now() + days * 86400000).toISOString();

          var ref = db.collection('embed_configs').doc();
          var doc = {
            orgId:     orgId,
            projectId: b.projectId ? clean(b.projectId, 120) : null,
            label:     clean(b.label, 160) || 'Proposed system',
            note:      clean(b.note, 1000),
            system: {
              kw: num(b.system && b.system.kw),
              kwh: num(b.system && b.system.kwh),
              durationH: num(b.system && b.system.durationH)
            },
            items:     items,
            revoked:   false,
            expiresAt: expiresAt,
            createdBy: caller.email,
            createdAt: FV.serverTimestamp(),
            updatedAt: FV.serverTimestamp()
          };

          return ref.set(doc).then(function () {
            /* Built against the tenant's FIRST registered hostname when they
               have one — a link that says cleancell.clearskyomega.com is
               already half the white label — and the open host otherwise. */
            var host = (org.domains && org.domains[0]) || 'silmarillion.clearskyomega.com';
            /* Clean path — cleanUrls:true redirects the .html form. */
            var url = 'https://' + host + '/embed/storefront?k=' + encodeURIComponent(key)
                    + '&c=' + encodeURIComponent(ref.id);
            return {
              ok: true, configId: ref.id, url: url, expiresAt: expiresAt,
              items: items.length, unpublishedItems: items.filter(function (i) { return !i.published; }).length
            };
          });
        });
      });
    });
  });
});

/* Withdraw a link. A flag, never a delete — CLAUDE.md's working conventions,
   and besides: an order already placed against this configuration references
   it, and deleting the snapshot would destroy the record of what was offered. */
function revoke(caller, b, db, FV) {
  var id = clean(b.configId, 64);
  if (!id) throw A.httpError(400, 'configId required');
  var ref = db.collection('embed_configs').doc(id);
  return ref.get().then(function (s) {
    if (!s.exists) throw A.httpError(404, 'configuration not found');
    var orgId = String((s.data() || {}).orgId || '').toLowerCase();
    return A.canActInOrg(caller, orgId).then(function (ok) {
      if (!ok) throw A.httpError(403, 'not your configuration');
      return ref.update({ revoked: true, revokedBy: caller.email, revokedAt: FV.serverTimestamp(), updatedAt: FV.serverTimestamp() })
        .then(function () { return { ok: true, configId: id, revoked: true }; });
    });
  });
}
