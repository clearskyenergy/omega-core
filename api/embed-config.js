/* ═══════════════════════════════════════════════════════════════════════════════
   GET /api/embed-config?k=<embed key>
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   The first call the embedded storefront makes. Answers "whose storefront am
   I, what does it look like, and what can be ordered from it?" — for a
   caller with no account, on a page served inside somebody else's website.

   ── WHY THE CATALOGUE IS ITS OWN DOCUMENT AND NOT A QUERY ────────────────
   The obvious implementation is  equipment where vendorOrgId == orgId. It is
   also how cost data ends up on a public web page. Those rows are the
   tenant's INTERNAL catalogue: they carry whatever fields a designer typed,
   and today that includes cost on some rows. A filter that returns "the safe
   fields" is a list somebody has to remember to update every time a new field
   is added, and the failure mode is silent and public.

   So publishing is EXPLICIT. Nothing is orderable until it has been written
   into omega_orgs/{orgId}/storefront/config.products — a curated list, in the
   shape below and no other. A field nobody put there cannot leak, because
   this endpoint constructs its output key by key rather than forwarding a
   document.

       omega_orgs/{orgId}/storefront/config = {
         headline, intro, disclaimer,
         requireAddress:  bool,
         collectBill:     bool,
         products: [ {
           sku, name, blurb, imageUrl,
           kw, kwh, chemistry, warrantyYears, leadTimeDays,
           priceMode: 'quote' | 'list',    // 'quote' is the default
           listPrice                       // only read when priceMode==='list'
         } ]
       }

   ── PRICE ────────────────────────────────────────────────────────────────
   priceMode 'quote' shows no number and is the default, because a C&I battery
   price is a function of the site and quoting one off a web form is how you
   end up honouring it. 'list' publishes exactly the one number the tenant
   typed. Neither mode exposes cost, margin, or any input to either — that
   math is not in this file and must never be moved into it.
   ═══════════════════════════════════════════════════════════════════════════════ */
'use strict';
var E = require('./_lib/embed');
var A = require('./_lib/admin');

function str(v, max) { return String(v == null ? '' : v).slice(0, max || 200); }
function num(v) { var n = Number(v); return isFinite(n) ? n : null; }
function bool(v) { return v === true; }

/* Constructed key by key. Do not replace this with a spread of the stored
   object — see the header. */
function publicProduct(p) {
  if (!p || typeof p !== 'object') return null;
  var sku = str(p.sku, 64);
  if (!sku) return null;
  var mode = (p.priceMode === 'list') ? 'list' : 'quote';
  var out = {
    sku:           sku,
    name:          str(p.name, 120) || sku,
    blurb:         str(p.blurb, 400),
    imageUrl:      /^https?:\/\//i.test(str(p.imageUrl, 400)) || str(p.imageUrl, 400).charAt(0) === '/'
                     ? str(p.imageUrl, 400) : '',
    kw:            num(p.kw),
    kwh:           num(p.kwh),
    /* The physical footprint, in feet. Needed by /api/embed-layout to draw
       the unit to scale on the customer's own lot — and ABSENT is a real
       state, not a zero: a product with no footprint on file is simply not
       offered a site study, because a default footprint drawn to scale on
       somebody's parcel is the most convincing kind of wrong. */
    widthFt:       num(p.widthFt),
    depthFt:       num(p.depthFt),
    /* ── integrates{} IS PUBLISHED, AND THAT IS A CORRECTION ────────────
       It was held back with the rest of the engineering fields on the
       reasoning that anything the guided build reads is internal. That was
       wrong, for one concrete reason and one principled one.

       CONCRETE: the storefront hands off into the editor with a SKU, and the
       editor resolves that SKU through THIS endpoint because the visitor has
       no account yet. Without these flags the guided build cannot know the
       PCS is inside the cabinet, so it draws an external one — a one-line
       that would not be built. The whole point of the hand-off is a drawing
       the customer can trust.

       PRINCIPLED: "what is inside the enclosure" is a datasheet fact a
       manufacturer prints in its own brochure, and for an all-in-one cabinet
       it is a selling point. It is not the supplier relationship.

       WHAT STAYS PRIVATE is the part that is: `inverter` (whose PCS they
       chose), `transformer`, `disconnect`, `usableKwh`, `dcv` and `notes`.
       Those are sourcing and margin-adjacent, and none of them is needed to
       draw a correct one-line. */
    integrates: (function () {
      var g = p.integrates || {};
      return { pcs: g.pcs === true, xfmr: g.xfmr === true, disco: g.disco === true };
    })(),
    chemistry:     str(p.chemistry, 40),
    warrantyYears: num(p.warrantyYears),
    leadTimeDays:  num(p.leadTimeDays),
    priceMode:     mode,
    listPrice:     mode === 'list' ? num(p.listPrice) : null
  };
  return out;
}

/* ── A PUBLISHED CONFIGURATION, WHEN THE LINK CARRIES ONE ─────────────────
   ?c=<configId> is a proposal a designer published with /api/order-link. The
   customer following that link has to SEE what they are being offered — a
   page that says "a proposal is attached" and shows nothing is a worse
   product than no link at all.

   So it is resolved HERE rather than by a second endpoint, which keeps ONE
   server-side reader deciding whether a configuration is still valid. The
   validity checks are repeated in /api/embed-order because that is the call
   with a consequence: a link that expires between the page load and the
   submit must not produce an order. Two checks, one truth, neither trusting
   the browser.

   Reshaped key by key like publicProduct(), for the same reason: this is
   served to the public and the stored document carries createdBy, an internal
   email address that has no business on a customer's screen. */
function publicConfig(ctx, snap) {
  if (!snap || !snap.exists) return { error: 'This link is no longer valid.' };
  var c = snap.data() || {};
  if (String(c.orgId || '').toLowerCase() !== ctx.orgId) return { error: 'This link is no longer valid.' };
  if (c.revoked === true) return { error: 'This proposal has been withdrawn. Please contact us.' };
  if (c.expiresAt && new Date(c.expiresAt).getTime() < Date.now()) {
    return { error: 'This proposal has expired. Please contact us for an updated one.' };
  }
  return {
    id: snap.id,
    label: str(c.label, 160) || 'Your proposed system',
    note: str(c.note, 1000),
    expiresAt: str(c.expiresAt, 40),
    system: {
      kw: num(c.system && c.system.kw),
      kwh: num(c.system && c.system.kwh),
      durationH: num(c.system && c.system.durationH)
    },
    items: (Array.isArray(c.items) ? c.items : []).slice(0, 40).map(function (it) {
      return {
        sku: str(it.sku, 64), name: str(it.name, 120) || str(it.sku, 64),
        qty: num(it.qty) || 1, kw: num(it.kw), kwh: num(it.kwh),
        listPrice: num(it.listPrice)
      };
    })
  };
}

module.exports = E.handler(function (req) {
  if (req.method !== 'GET') throw A.httpError(405, 'GET only');

  return E.resolve(req, { limit: 120, scope: 'storefront' }).then(function (ctx) {
    var db = A.db();
    var wantConfig = str((req.query || {}).c || (req.query || {}).config, 64);
    var loads = [
      db.collection('omega_orgs').doc(ctx.orgId).collection('storefront').doc('config').get(),
      wantConfig ? db.collection('embed_configs').doc(wantConfig).get() : Promise.resolve(null)
    ];
    return Promise.all(loads).then(function (r) {
        var s = r[0];
        var config = wantConfig ? publicConfig(ctx, r[1]) : null;
        var sf = s.exists ? (s.data() || {}) : {};
        var em = ctx.embed || {};
        var wl = ctx.whiteLabel || {};

        var products = (Array.isArray(sf.products) ? sf.products : [])
          .map(publicProduct).filter(Boolean).slice(0, 60);

        return {
          ok: true,
          /* The BRAND the customer sees. Never 'ClearSky-OMEGA' — on this
             surface the platform has no name at all, because the customer is
             on their supplier's website and that is the only company in the
             conversation. attribution is honoured but defaults to empty
             HERE (unlike the signed-in chrome): our name on a stranger's
             checkout is a marketing decision, so it is opt-IN per contract
             via embed.attribution rather than inherited. */
          brand: {
            /* The tenant key. Already world-readable in tenant_public, and
               the hand-off needs it: omega-whitelabel.js only activates for a
               tenant it can NAME (block() requires CLEARSKY_CONFIG.tenant.
               orgId), so without this the editor arrives with a white-label
               block that never switches on and a tab still reading
               ClearSky OMEGA. */
            orgId:     ctx.orgId,
            name:      str(ctx.org.name, 120) || ctx.orgId,
            /* What the PLATFORM is called for this tenant. Already
               world-readable in tenant_public (the login page paints it
               before there is a user), so this is no new disclosure — it is
               here because the hand-off into the editor carries an anonymous
               visitor who has no other way to learn it, and an editor tab
               reading "ClearSky OMEGA" is the leak the white label exists to
               stop. */
            platformName: str((ctx.whiteLabel || {}).platformName || '', 80),
            shortName:    str((ctx.whiteLabel || {}).shortName || '', 60),
            logoUrl:   str(ctx.org.logoUrl, 400),
            accent:    str(em.accent || wl.accent || '', 32),
            ink:       str(em.ink || wl.ink || '', 32),
            supportEmail: str(em.supportEmail || wl.supportEmail || '', 160),
            supportPhone: str(em.supportPhone || '', 40),
            attribution: em.attribution === 'powered-by'
                           ? str(wl.attributionText || 'Powered by ClearSky OMEGA', 80) : ''
          },
          copy: {
            headline:   str(sf.headline || em.headline || 'Size your energy storage system', 160),
            intro:      str(sf.intro || em.intro || '', 600),
            disclaimer: str(sf.disclaimer || em.disclaimer || '', 600),
            cta:        str(em.cta || 'Request this system', 60)
          },
          flow: {
            requireAddress: bool(sf.requireAddress),
            collectBill:    sf.collectBill !== false,
            /* No products published = the storefront is a sizing tool with a
               contact step. A working page is better than an empty one, and
               "we will come back with options" is a true thing to say. */
            hasCatalog:     products.length > 0,
            /* The site study is on unless switched off, and only offered for
               products that can actually be drawn. Computed here so the page
               never shows a button that the endpoint will refuse. */
            siteStudy:      sf.siteStudy !== false
                              && products.some(function (p) { return p.widthFt && p.depthFt; }),
            /* Whether the address step has to come after the enquiry. The
               page needs to know to order its own steps; the ENFORCEMENT is
               in api/embed-layout.js, which refuses without the receipt. */
            studyNeedsContact: sf.requireContactForLayout !== false,
            /* Whether to PITCH the site designer. Not a link into it — the
               editor is gated on having an account (omega-editor-gate.js),
               because it is the thing being sold rather than the sample. This
               only decides whether the storefront describes it and takes an
               enquiry. Needs no catalogue: a tenant who sizes but sells no
               product from the web can still be selling accounts. */
            designerPitch: sf.designerPitch !== false
          },
          products: products,
          /* null when the link carried no ?c=; { error } when it carried one
             that is no longer good, so the page can say which of "expired",
             "withdrawn" and "unknown" happened instead of failing blank. */
          config: config
        };
      });
  });
});
