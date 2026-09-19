/* ═══════════════════════════════════════════════════════════════════════════════
   ClearSky-OMEGA · Storefront → editor hand-off  (omega-storefront-handoff.js)
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   ─────────────────────────────────────────────────────────────────────────────
   THE STEP BETWEEN "SIZE IT" AND "ORDER IT"
   ─────────────────────────────────────────────────────────────────────────────
   The storefront sizes a system and draws it on the customer's lot. This is
   what happens when they press "Design it yourself": the editor opens,
   branded as the manufacturer, with their system already configured and the
   BESS Guided Build ready to place it.

       /editor?k=<embed key>&sku=CC-2000&qty=4&addr=4200+W+Industrial+Dr

   That is the whole hand-off. It is A URL AND NOTHING ELSE — no handoff
   collection, no server round trip to create one, no expiry to get wrong and
   no document holding a stranger's address. Everything in it is already in
   that visitor's own browser, and the key is publishable by design.

   ─────────────────────────────────────────────────────────────────────────────
   THE VISITOR HAS NO ACCOUNT, AND THAT IS THE POINT
   ─────────────────────────────────────────────────────────────────────────────
   This is a manufacturer's CUSTOMER, arriving from the manufacturer's own
   website. Asking them to make an account before they can see their own
   battery on their own site would lose most of them — and the whole reason
   the hand-off exists is to get them building in the platform.

   So everything here resolves through /api/embed-config, the same public
   endpoint the storefront already uses: the brand, the platform name and the
   product. The editor already runs signed-out (it loads a project from the
   URL and prompts on save), so they design first and sign in when they want
   to keep it. That prompt is the conversion, and it happens after they are
   invested rather than before.

   ── WHAT IT DELIBERATELY DOES NOT DO ────────────────────────────────────
   It does not place anything on the canvas. It CONFIGURES and then opens the
   BESS Guided Build, which is the editor's own flow for putting a system
   down — clearance rules, trench routing, the one-line, the skip-and-reroute
   when the cabinet integrates its PCS. Forging elements directly would be a
   second, worse placement engine that drifts from the real one.

   ── integrates{} MATTERS HERE ───────────────────────────────────────────
   getWizSteps() skips the PCS, disconnect and transformer steps when the pad
   already contains them. Those flags come from /api/embed-config (see the
   correction note in that file). Without them the hand-off draws an external
   PCS on a cabinet that has one inside — a one-line that would not be built,
   handed to a customer who came to us for a drawing they could trust.

   ES5. No build step. Inert on any page without the parameters.
   ═══════════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  function qs(name) {
    try {
      var m = new RegExp('[?&]' + name + '=([^&]*)').exec(global.location.search || '');
      return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : '';
    } catch (e) { return ''; }
  }

  function num(v) { var n = Number(v); return isFinite(n) ? n : null; }

  /* The key's shape is checked here too, not because this is a security
     boundary — it is not, api/_lib/embed.js says so at length — but because
     a malformed value would otherwise be pasted straight into a URL. */
  function readParams() {
    var k = qs('k') || qs('key');
    if (!/^omega_pk_[a-z0-9_]{8,96}$/.test(k)) return null;
    var sku = qs('sku');
    if (!sku) return null;
    return {
      key: k, sku: sku,
      qty: Math.max(1, Math.min(999, num(qs('qty')) || 1)),
      addr: qs('addr') || qs('address') || '',
      kw: num(qs('kw')), kwh: num(qs('kwh'))
    };
  }

  function fetchConfig(key) {
    return fetch('/api/embed-config?k=' + encodeURIComponent(key), {
      headers: { 'X-Omega-Embed-Key': key }
    }).then(function (r) {
      if (!r.ok) throw new Error('config ' + r.status);
      return r.json();
    });
  }

  /* Brand the chrome for somebody with no account and therefore no org
     record to read. Everything here came from tenant_public via
     /api/embed-config, which is world-readable by design. */
  function applyBrand(cfgOut, brand) {
    var c = global.CLEARSKY_CONFIG || (global.CLEARSKY_CONFIG = {});
    if (!c.tenant) c.tenant = {};
    /* orgId FIRST, and it is not decoration: omega-whitelabel.js's block()
       only looks at a tenant it can name, so a block set without one never
       activates and the editor keeps the ClearSky title. Found by running
       the hand-off rather than by reading it. */
    if (brand.orgId) c.tenant.orgId = String(brand.orgId).toLowerCase();
    if (brand.name) c.tenant.clientName = brand.name;
    if (brand.logoUrl) c.tenant.logo = brand.logoUrl;
    if (brand.platformName) {
      c.tenant.whiteLabel = {
        enabled: true,
        platformName: brand.platformName,
        shortName: brand.shortName || brand.name || '',
        /* The storefront's own attribution decision already travelled with
           the brand; it is not re-decided here. */
        attribution: brand.attribution ? 'powered-by' : 'none',
        attributionText: brand.attribution || '',
        accent: brand.accent || ''
      };
    }
    /* Through the checked reference, not the bare name. `global` is the
       window this module was given; a bare `OmegaWhiteLabel` is a lookup on
       whatever the real global scope happens to be, and when those differ it
       throws a ReferenceError straight into the catch below — leaving the
       editor titled "ClearSky OMEGA" with no error logged anywhere. Silent,
       and exactly the leak the white label exists to stop. */
    var WL = global.OmegaWhiteLabel;
    try {
      if (WL) {
        WL.apply();
        if (WL.active()) document.title = WL.platformName() + ' — Site Designer';
      }
    } catch (e) {}
    /* The editor's own brand resolver (CS_BRAND, predating omega-brand.js)
       is what the EXPORTS read. Feed it too, or the proposal a customer
       downloads says "Your Company". */
    try {
      if (global.CS_BRAND && brand.name) global.CS_BRAND.companyName = brand.name;
      else if (brand.name) global.CS_BRAND = { companyName: brand.name, logoDataUrl: '' };
    } catch (e) {}
  }

  /* The published product → the shape the editor's BESS list and guided
     build expect. Mirrors omega-bess-products.js for the signed-in path;
     kept separate because that one reads the FULL record and this one only
     ever sees the published subset. */
  function seedSystem(p, qty) {
    var key = ('SF-' + p.sku).toUpperCase().replace(/[^A-Z0-9\-]/g, '-');
    var entry = {
      mfr: p.brandName || '', model: p.name || p.sku, chem: p.chemistry || 'LFP',
      kwh: num(p.kwh), kw: num(p.kw),
      dur: (num(p.kw) > 0 && num(p.kwh) > 0) ? +(num(p.kwh) / num(p.kw)).toFixed(2) : null,
      widthFt: num(p.widthFt), depthFt: num(p.depthFt),
      _incPCS: !!(p.integrates && p.integrates.pcs),
      _incXfmr: !!(p.integrates && p.integrates.xfmr),
      _incDisco: !!(p.integrates && p.integrates.disco),
      _tenant: true, sku: p.sku
    };
    try {
      if (global.BESS_CATALOG && !global.BESS_CATALOG[key]) global.BESS_CATALOG[key] = entry;
    } catch (e) {}

    var S = global.S;
    if (!S) return null;
    /* Replace rather than append: arriving from a storefront link means
       "this is the system", and a stale entry from a previous visit would
       silently size the build. */
    var b = {
      id: 'sf-' + Date.now(),
      name: entry.model, mfr: entry.mfr, model: entry.model,
      kw: entry.kw, kwh: entry.kwh, qty: String(qty || 1),
      catalogKey: key,
      _incPCS: entry._incPCS, _incXfmr: entry._incXfmr, _incDisco: entry._incDisco,
      _fromStorefront: true
    };
    try { S.bessList = [b]; } catch (e) { return null; }
    return b;
  }

  function goToAddress(addr) {
    if (!addr) return;
    try {
      var el = document.getElementById('addr-in');
      if (!el) return;
      el.value = addr;
      if (typeof global.fetchMap === 'function') global.fetchMap();
    } catch (e) {}
  }

  /* The editor's own flow does the placing. Opened once the canvas exists —
     firing it into a half-built page is how a modal ends up behind the map. */
  function openGuided(tries) {
    if ((tries || 0) > 30) return;
    if (typeof global.openBessGuidedBuild === 'function' && document.getElementById('addr-in')) {
      try { global.openBessGuidedBuild(); } catch (e) {}
      return;
    }
    setTimeout(function () { openGuided((tries || 0) + 1); }, 300);
  }

  /* ── ORDER IT, FROM THE DESIGNER ─────────────────────────────────────
     The point of the whole funnel. A visitor who arrived on a hand-off has
     no account, so the order goes through /api/embed-order — the same public
     endpoint the storefront uses, with the same publishable key, the same
     rate limits and the same status:'new' pin. Nothing new is trusted.

     The button is only mounted when a hand-off is live. A signed-in user in
     the editor orders the other way (POST /api/orders action:'create'),
     because they have an org and an order should be attributed to it. */
  var ORDER = null;      /* { key, sku, qty, product, brand } while live */

  function mountOrderButton(ctx) {
    ORDER = ctx;
    if (document.getElementById('sf-order-btn')) return;
    var b = document.createElement('button');
    b.id = 'sf-order-btn';
    b.type = 'button';
    b.textContent = 'Order this system';
    b.setAttribute('style',
      'position:fixed;right:18px;bottom:18px;z-index:99998;padding:12px 20px;border:0;'
      + 'border-radius:10px;font:700 14px -apple-system,system-ui,sans-serif;cursor:pointer;'
      + 'background:' + (ctx.accent || '#2B5FA8') + ';color:#fff;box-shadow:0 4px 16px rgba(0,0,0,.35)');
    b.onclick = openOrderForm;
    document.body.appendChild(b);
  }

  function esc(v) {
    return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function openOrderForm() {
    if (!ORDER || document.getElementById('sf-order-modal')) return;
    var qty = currentQty();
    var d = document.createElement('div');
    d.id = 'sf-order-modal';
    d.setAttribute('style',
      'position:fixed;inset:0;background:rgba(6,12,22,.78);z-index:99999;display:flex;'
      + 'align-items:center;justify-content:center;padding:20px;'
      + 'font:14px/1.5 -apple-system,system-ui,sans-serif');
    d.innerHTML =
      '<div style="background:#fff;color:#14171A;border-radius:12px;max-width:440px;width:100%;padding:22px">'
      + '<div style="font-size:17px;font-weight:800;margin-bottom:4px">Order this system</div>'
      + '<div style="font-size:13px;color:#5B6672;margin-bottom:16px">'
      +   esc(qty) + ' × ' + esc(ORDER.product.name || ORDER.sku)
      +   '<br>' + esc(ORDER.brand || '') + ' will be in touch to confirm. Nothing is charged here.</div>'
      + '<label style="display:block;font-size:13px;font-weight:600;margin-bottom:4px">Your name</label>'
      + '<input id="sf-o-name" style="width:100%;padding:9px 10px;border:1px solid rgba(20,23,26,.2);border-radius:8px;font:inherit;margin-bottom:10px">'
      + '<label style="display:block;font-size:13px;font-weight:600;margin-bottom:4px">Company</label>'
      + '<input id="sf-o-co" style="width:100%;padding:9px 10px;border:1px solid rgba(20,23,26,.2);border-radius:8px;font:inherit;margin-bottom:10px">'
      + '<label style="display:block;font-size:13px;font-weight:600;margin-bottom:4px">Email</label>'
      + '<input id="sf-o-email" type="email" style="width:100%;padding:9px 10px;border:1px solid rgba(20,23,26,.2);border-radius:8px;font:inherit;margin-bottom:10px">'
      + '<label style="display:block;font-size:13px;font-weight:600;margin-bottom:4px">Site address</label>'
      + '<input id="sf-o-addr" style="width:100%;padding:9px 10px;border:1px solid rgba(20,23,26,.2);border-radius:8px;font:inherit;margin-bottom:12px">'
      + '<label style="display:flex;gap:8px;align-items:flex-start;font-size:13px;margin-bottom:14px">'
      +   '<input type="checkbox" id="sf-o-consent" style="margin-top:3px">'
      +   '<span>Yes, ' + esc(ORDER.brand || 'we') + ' may contact me about this system.</span></label>'
      + '<div id="sf-o-msg" style="font-size:13px;color:#8A1F1F;min-height:18px;margin-bottom:8px"></div>'
      + '<div style="display:flex;gap:10px">'
      +   '<button id="sf-o-send" style="flex:1;padding:11px;border:0;border-radius:8px;font:700 14px inherit;cursor:pointer;background:'
      +     esc(ORDER.accent || '#2B5FA8') + ';color:#fff">Send the request</button>'
      +   '<button id="sf-o-cancel" style="padding:11px 16px;border:1px solid rgba(20,23,26,.2);border-radius:8px;font:600 14px inherit;cursor:pointer;background:#fff">Cancel</button>'
      + '</div></div>';
    document.body.appendChild(d);

    var addr = document.getElementById('addr-in');
    if (addr && addr.value) document.getElementById('sf-o-addr').value = addr.value;

    document.getElementById('sf-o-cancel').onclick = function () { d.remove(); };
    d.onclick = function (ev) { if (ev.target === d) d.remove(); };
    document.getElementById('sf-o-send').onclick = sendOrder;
  }

  /* Whatever the designer has ACTUALLY got configured, not what the link
     said — they came here to change it, and ordering the link's quantity
     after they doubled it is the bug this avoids. */
  function currentQty() {
    try {
      var b = global.S && global.S.bessList && global.S.bessList[0];
      if (b && b.qty) return Math.max(1, Math.min(999, Number(b.qty) || 1));
    } catch (e) {}
    return ORDER ? ORDER.qty : 1;
  }

  function sendOrder() {
    var msg = document.getElementById('sf-o-msg');
    function say(t) { if (msg) msg.textContent = t || ''; }
    var name = (document.getElementById('sf-o-name').value || '').trim();
    var email = (document.getElementById('sf-o-email').value || '').trim();
    if (!name) return say('Please enter your name.');
    if (!email) return say('Please enter an email address.');
    if (!document.getElementById('sf-o-consent').checked) return say('Please tick the box so we know we may contact you.');

    var btn = document.getElementById('sf-o-send');
    btn.disabled = true; btn.textContent = 'Sending…';
    say('');

    fetch('/api/embed-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Omega-Embed-Key': ORDER.key,
                 'X-Omega-Parent': global.location.origin },
      body: JSON.stringify({
        key: ORDER.key, consent: true, _hp: '',
        customer: {
          name: name, company: (document.getElementById('sf-o-co').value || '').trim(),
          email: email, notes: 'Designed in the site designer.',
          address: { line1: (document.getElementById('sf-o-addr').value || '').trim() }
        },
        items: [{ sku: ORDER.sku, qty: currentQty() }],
        system: { kw: ORDER.product.kw, kwh: (ORDER.product.kwh || 0) * currentQty() }
      })
    }).then(function (r) {
      return r.json().then(function (j) {
        if (!r.ok) throw new Error((j && j.error) || ('Request failed (' + r.status + ')'));
        return j;
      });
    }).then(function (j) {
      var d = document.getElementById('sf-order-modal');
      if (d) d.innerHTML =
        '<div style="background:#fff;color:#14171A;border-radius:12px;max-width:440px;width:100%;padding:24px">'
        + '<div style="font-size:17px;font-weight:800;margin-bottom:8px">Request received</div>'
        + '<div style="font-size:14px;color:#3A4450">' + esc(j.message || 'We will be in touch shortly.')
        + (j.orderNo ? '<br><br>Your reference is <b>' + esc(j.orderNo) + '</b>.' : '') + '</div>'
        + '<button onclick="document.getElementById(\'sf-order-modal\').remove()" '
        + 'style="margin-top:16px;padding:10px 18px;border:0;border-radius:8px;font:700 14px inherit;cursor:pointer;background:'
        + esc(ORDER.accent || '#2B5FA8') + ';color:#fff">Back to the design</button></div>';
      var b = document.getElementById('sf-order-btn');
      if (b) { b.textContent = 'Order sent ✓'; b.disabled = true; b.style.opacity = '.7'; }
    })['catch'](function (e) {
      btn.disabled = false; btn.textContent = 'Send the request';
      say(e.message || 'Could not send that.');
    });
  }

  function run() {
    var p = readParams();
    if (!p) return;
    fetchConfig(p.key).then(function (cfgOut) {
      var brand = (cfgOut && cfgOut.brand) || {};
      applyBrand(cfgOut, brand);

      var list = (cfgOut && cfgOut.products) || [];
      var product = null;
      for (var i = 0; i < list.length; i++) if (list[i].sku === p.sku) product = list[i];
      if (!product) return;                     /* a stale link; the editor still opens */
      product.brandName = brand.shortName || brand.name || '';

      /* The quantity the storefront worked out, or one derived from the
         sizing carried in the link. Never invented from thin air. */
      var qty = p.qty;
      if (qty === 1 && p.kwh && product.kwh > 0) qty = Math.max(1, Math.ceil(p.kwh / product.kwh));

      seedSystem(product, qty);
      goToAddress(p.addr);
      openGuided(0);
      mountOrderButton({
        key: p.key, sku: p.sku, qty: qty, product: product,
        brand: brand.shortName || brand.name || '', accent: brand.accent || ''
      });
    })['catch'](function () { /* the editor is perfectly usable without us */ });
  }

  if (global.document) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
    else run();
  }

  global.OmegaStorefrontHandoff = {
    readParams: readParams, seedSystem: seedSystem, applyBrand: applyBrand, run: run,
    mountOrderButton: mountOrderButton, currentQty: currentQty
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = global.OmegaStorefrontHandoff;
})(typeof window !== 'undefined' ? window : this);
