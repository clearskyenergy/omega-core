/* ═══════════════════════════════════════════════════════════════════════════════
   ClearSky-OMEGA · Tenant BESS products  (omega-bess-products.js)
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   ─────────────────────────────────────────────────────────────────────────────
   THE PROBLEM THIS SOLVES, STATED PLAINLY
   ─────────────────────────────────────────────────────────────────────────────
   editor.html ships BESS_CATALOG: 29 products from 7 manufacturers — Gotion,
   Pytes, Canadian Solar, Aspen Woods, CATL, FENECON, Autel. The manufacturer
   field on the BESS config modal is `value="Gotion"`, and omega-bess-catalog.js
   sets DEFAULT_KEY = "gotion".

   That is a sensible default for a developer or an EPC, who buys from whoever
   quotes best. It is the WORST POSSIBLE default for a white-labelled battery
   MANUFACTURER: open the BESS Guided Build on Clean Cell's own platform and it
   lays out a competitor's container. We would be handing their sales team a
   tool that specs Gotion.

   omega-bess-catalog.js already anticipated this — "An organisation's own
   product list still wins" — but nothing implemented it, and editor.html does
   not even load that file.

   ─────────────────────────────────────────────────────────────────────────────
   ONE PRODUCT LIST, NOT FOUR
   ─────────────────────────────────────────────────────────────────────────────
   Before this, a tenant's products could live in four places:

     editor.html BESS_CATALOG          hardcoded, no tenant can add to it
     omega-bess-catalog.js             published datasheets, one brand
     equipment/{sku}                   the BOM/RFQ catalogue
     omega_orgs/{org}/storefront/config.products    the public storefront

   A manufacturer selling their own product has ONE catalogue, so this reads
   the storefront list — the one an operator already has to fill in for the
   embed to work — and feeds the guided build from it. Fill it once; it drives
   the public storefront, the site-study footprints AND what the editor places.

   ── AND THE PUBLIC SUBSET STAYS A SUBSET ────────────────────────────────
   The engineering fields below (inverter, transformer, disconnect, usable
   kWh, integration flags) are read HERE and never published: api/embed-config.js
   constructs its response key by key, so a field nobody added to that list
   cannot reach a customer's browser. That was built for exactly this — it is
   why the shared list is safe.

   ── NO PRICE. EVER. ─────────────────────────────────────────────────────
   Thirteen of the hardcoded BESS_CATALOG entries carry `eqcost` in the page
   source. That predates this file and is not made worse by it: nothing here
   maps a price into the catalogue, and nothing here should. CLAUDE.md § IP.

   ─────────────────────────────────────────────────────────────────────────────
   THE PRODUCT SHAPE
   ─────────────────────────────────────────────────────────────────────────────
     omega_orgs/{orgId}/storefront/config.products[] = {
       sku, name, kw, kwh,              // published + used everywhere
       widthFt, depthFt,                // published; the site study draws these
       priceMode, listPrice,            // published
       // ── engineering only, NEVER published ──
       chem, usableKwh, durationH, dcv,
       inverter, inverterKva, transformer, disconnect,
       integrates: { pcs, xfmr, disco },   // what is inside the cabinet
       notes
     }

   `integrates` is the one that changes the drawing. getWizSteps() in
   editor.html SKIPS the PCS, disconnect and transformer steps when the pad
   already contains them, and re-routes the one-line accordingly. A container
   with an internal PCS that gets drawn with an external one is not a small
   cosmetic error — it is a one-line that would not be built.

   ES5. No build step. Safe to load on a page with no Firebase and no user:
   every entry point returns empty rather than throwing.
   ═══════════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  /* FOURTH COPY OF THIS MAP — the two rules engines and editor.html's
     _projOrgId() already carry it, and CLAUDE.md records the wart. Kept
     local rather than reaching into the editor, so this file also works on
     a page that does not define _projOrgId. */
  var ORG_ALIAS = { 'fenecon.de': 'fenecon.com', 'fenecon.us': 'fenecon.com' };

  function orgOf(email) {
    var d = String(email || '').toLowerCase().split('@')[1] || '';
    return ORG_ALIAS[d] || d;
  }

  /* The org, from whatever this page happens to know. The editor resolves it
     one way, the portal another; both are honoured rather than requiring the
     full omega-tenant.js runtime, which editor.html does not load. */
  function orgId() {
    try {
      if (global.OMEGA_WORKSPACE && global.OMEGA_WORKSPACE.orgId) return String(global.OMEGA_WORKSPACE.orgId).toLowerCase();
      var c = global.CLEARSKY_CONFIG || {};
      if (c.tenant && c.tenant.orgId) return String(c.tenant.orgId).toLowerCase();
      if (typeof global._projOrgId === 'function') { var p = global._projOrgId(); if (p) return String(p).toLowerCase(); }
      var fb = global.firebase;
      if (fb && fb.auth && fb.apps && fb.apps.length) {
        var u = fb.auth().currentUser;
        if (u && u.email) return orgOf(u.email);
      }
    } catch (e) {}
    return '';
  }

  function num(v) { var n = Number(v); return isFinite(n) ? n : null; }
  function str(v) { return v == null ? '' : String(v); }

  /* A stored product → one BESS_CATALOG entry.

     The key is namespaced by org so a tenant's 'CC-2000' can never collide
     with, or silently replace, a shipped entry. Collisions here would be
     invisible and would change what somebody's drawing says. */
  function toCatalogEntry(orgKey, p) {
    if (!p || !p.sku) return null;
    var kwh = num(p.kwh), kw = num(p.kw);
    if (!(kwh > 0) && !(kw > 0)) return null;

    var integrates = p.integrates || {};
    var dur = num(p.durationH);
    if (dur == null && kw > 0 && kwh > 0) dur = +(kwh / kw).toFixed(2);

    var dims = '';
    if (num(p.widthFt) && num(p.depthFt)) dims = num(p.widthFt) + ' × ' + num(p.depthFt) + ' ft';

    return {
      key: (orgKey + '-' + p.sku).toUpperCase().replace(/[^A-Z0-9\-]/g, '-'),
      entry: {
        mfr:   str(p.mfr) || str(p.brand) || '',   /* filled by caller when blank */
        model: str(p.name) || str(p.sku),
        chem:  str(p.chem) || str(p.chemistry) || 'LFP',
        kwh:   kwh,
        usable: num(p.usableKwh),
        kw:    kw,
        dur:   dur,
        dcv:   str(p.dcv),
        inv:   str(p.inverter),
        ikva:  num(p.inverterKva),
        xfmr:  str(p.transformer),
        disco: str(p.disconnect),
        dims:  dims,
        /* What getWizSteps() reads to skip a step and re-route the one-line. */
        _incPCS:   integrates.pcs   === true,
        _incXfmr:  integrates.xfmr  === true,
        _incDisco: integrates.disco === true,
        widthFt:  num(p.widthFt),
        depthFt:  num(p.depthFt),
        notes: str(p.notes),
        /* Marks the entry as the tenant's own, so a UI can lead with it and
           a reader can tell it from a shipped datasheet. NO eqcost. */
        _tenant: true,
        sku: str(p.sku)
      }
    };
  }

  var _cache = null;

  /* Resolves { orgId, brand, entries:{key:entry}, keys:[], count }.
     NEVER rejects — a tenant with no list, no Firestore or no signed-in user
     gets an empty result and the shipped catalogue is untouched. */
  function load() {
    if (_cache) return Promise.resolve(_cache);
    var org = orgId();
    var empty = { orgId: org, brand: '', entries: {}, keys: [], count: 0 };
    if (!org) return Promise.resolve(empty);

    var fb = global.firebase;
    if (!fb || !fb.firestore || !fb.apps || !fb.apps.length) return Promise.resolve(empty);

    var db;
    try { db = fb.firestore(); } catch (e) { return Promise.resolve(empty); }

    return Promise.all([
      db.collection('omega_orgs').doc(org).collection('storefront').doc('config').get(),
      db.collection('omega_orgs').doc(org).get()
    ]).then(function (r) {
      var sf = (r[0] && r[0].exists) ? (r[0].data() || {}) : {};
      var og = (r[1] && r[1].exists) ? (r[1].data() || {}) : {};
      /* The brand on the drawing is the tenant's own name — or whatever the
         white-label block says they are called, which for an OEM reselling
         under a second brand is not the same string. */
      var wl = og.whiteLabel || {};
      var brand = str(og.bessBrand) || str(wl.shortName) || str(og.name) || org;

      var list = Array.isArray(sf.products) ? sf.products : [];
      var out = { orgId: org, brand: brand, entries: {}, keys: [], count: 0 };
      var slug = String(og.slug || org.split('.')[0] || 'org');

      for (var i = 0; i < list.length; i++) {
        var made = toCatalogEntry(slug, list[i]);
        if (!made) continue;
        if (!made.entry.mfr) made.entry.mfr = brand;
        out.entries[made.key] = made.entry;
        out.keys.push(made.key);
        out.count++;
      }
      _cache = out;
      return out;
    }, function () { return empty; });
  }

  /* Merge the tenant's products INTO a catalogue object and report the brand.
     Additive: a shipped entry is never removed or overwritten, because an
     existing drawing may reference one by key and would otherwise re-render
     as a different battery. A tenant who wants a shipped product gone asks
     ClearSky; silently hiding it here would be a footgun. */
  function mergeInto(catalog) {
    return load().then(function (t) {
      if (!catalog || !t.count) return t;
      for (var i = 0; i < t.keys.length; i++) {
        var k = t.keys[i];
        if (!Object.prototype.hasOwnProperty.call(catalog, k)) catalog[k] = t.entries[k];
      }
      return t;
    });
  }

  global.OmegaBessProducts = {
    orgId: orgId, orgOf: orgOf, load: load, mergeInto: mergeInto,
    toCatalogEntry: toCatalogEntry,
    _reset: function () { _cache = null; }   /* tests */
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = global.OmegaBessProducts;
})(typeof window !== 'undefined' ? window : this);
