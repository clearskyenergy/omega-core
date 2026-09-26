/* ═══════════════════════════════════════════════════════════════════════════════
   ClearSky-OMEGA · Editor access gate  (omega-editor-gate.js)
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   ─────────────────────────────────────────────────────────────────────────────
   THE EDITOR IS THE PRODUCT, NOT THE SAMPLE
   ─────────────────────────────────────────────────────────────────────────────
   editor.html had no access gate at all. Anyone with the URL got the whole
   designer: guided builds, conduit routing, the one-line, the equipment
   library, the exports. The tool REGISTRY marks it tier STANDARD, which hides
   the tile in the portal — and a hidden tile is not a gate, as CLAUDE.md puts
   it: "A hidden link is not a gate; a function that refuses is."

   What a white-labelled manufacturer's customer is sold is the STOREFRONT —
   size a system, see it on their own lot, order the product. The DESIGNER is
   the thing they are sold NEXT, as a ClearSky-OMEGA account carrying the
   manufacturer's name. Giving it away at the bottom of a storefront funnel
   sells nothing and puts strangers inside the platform.

   So: the storefront is the taste, and this is the door.

   ─────────────────────────────────────────────────────────────────────────────
   WHAT IT ACTUALLY REQUIRES
   ─────────────────────────────────────────────────────────────────────────────
   A SIGNED-IN USER OF AN ACTIVE TENANT. That is the whole rule, and the
   reason it is enough is upstream: workspaces are created PENDING and a human
   at ClearSky approves them (api/tenant-approve.js). "Has an account" already
   means "somebody decided they could have one".

   ── IT FAILS OPEN ON A MISSING RECORD, ON PURPOSE ───────────────────────
   firestore.rules' tenantActive() says it best: "ABSENT COUNTS AS ACTIVE.
   Every tenant live today has no omega_orgs doc until seed-omega-orgs runs. A
   helper that failed closed on a missing doc would lock out all seven
   customers the moment it was consulted."

   The same trap is here and the same answer applies. A signed-in user whose
   org has no record yet gets in; only an EXPLICIT 'pending', 'suspended' or
   'cancelled', or an explicit toolOverrides.editor === false, refuses. Get
   this backwards and the first thing this file does in production is lock out
   every paying customer.

   ── IT IS NOT THE SECURITY BOUNDARY ─────────────────────────────────────
   firestore.rules is. Every project read and write is already scoped by
   orgId, so a determined person who bypasses this overlay still cannot read
   or save anybody's work — they get an empty canvas they cannot keep. This
   gate decides WHO IS SHOWN THE PRODUCT. That is a commercial control, and
   pretending it is more would be the mistake.

   ── THE REFUSAL IS THE PITCH ────────────────────────────────────────────
   A stranger who reaches this page came from somewhere — usually a
   manufacturer's storefront. Telling them "access denied" wastes the one
   moment they are interested. The screen is white-labelled, says what the
   designer does, and gives them a way to ask for an account.

   ES5. No build step. Loads early and paints before the editor does.
   ═══════════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var ORG_ALIAS = { 'fenecon.de': 'fenecon.com', 'fenecon.us': 'fenecon.com' };
  var STAFF = ['clearsky-usa.com'];
  var BLOCKED_STATUS = ['pending', 'suspended', 'cancelled'];
  var MAX_WAIT_MS = 12000;

  function orgOf(email) {
    var d = String(email || '').toLowerCase().split('@')[1] || '';
    return ORG_ALIAS[d] || d;
  }

  /* ── The curtain ───────────────────────────────────────────────────────
     Painted immediately, before auth has answered, and taken down only when
     the gate allows. The other way round — render, then hide on refusal —
     flashes the whole product at everybody who is refused. */
  var SHIELD = 'omega-editor-gate';

  function shield() {
    if (!global.document || document.getElementById(SHIELD)) return;
    var d = document.createElement('div');
    d.id = SHIELD;
    d.setAttribute('style',
      'position:fixed;inset:0;z-index:2147483646;background:#0A1628;color:#E5EEF7;'
      + 'display:flex;align-items:center;justify-content:center;padding:24px;'
      + 'font:15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif');
    d.innerHTML = '<div style="opacity:.6;font-size:14px">Checking your access…</div>';
    (document.body || document.documentElement).appendChild(d);
  }

  function lift() {
    var d = document.getElementById(SHIELD);
    if (d && d.parentNode) d.parentNode.removeChild(d);
  }

  function esc(v) {
    return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* Whatever branding this page managed to resolve. On a hand-off from a
     storefront that is the manufacturer's; for a signed-in user it is their
     own; with neither it is ours, and saying "ClearSky-OMEGA" to somebody who
     has never heard of us is the correct answer in that case. */
  function brand() {
    var b = { name: '', platform: 'ClearSky-OMEGA', accent: '#2B5FA8', support: '' };
    try {
      var WL = global.OmegaWhiteLabel;
      if (WL && WL.active()) {
        b.platform = WL.platformName();
        b.name = WL.shortName();
        b.support = WL.supportEmail() || '';
        var blk = WL.block() || {};
        if (blk.accent) b.accent = blk.accent;
      }
      var t = (global.CLEARSKY_CONFIG || {}).tenant;
      if (t && t.clientName && !b.name) b.name = t.clientName;
    } catch (e) {}
    return b;
  }

  function refuse(kind, detail) {
    shield();
    var d = document.getElementById(SHIELD);
    if (!d) return;
    var b = brand();
    var who = b.name || b.platform;

    var title, body, cta;
    if (kind === 'signed-out') {
      title = 'The ' + esc(who) + ' site designer';
      body = 'Lay a battery system out on a real site plan — clearances, trenching, '
           + 'switchgear and the one-line — then export it or order from it. '
           + 'It is part of a ' + esc(who) + ' account.';
      cta = 'Sign in';
    } else if (kind === 'pending') {
      title = 'Your workspace is being set up';
      body = 'Somebody at ' + esc(b.platform) + ' is reviewing it — usually within one '
           + 'business day. You will get an email the moment it is live.';
      cta = '';
    } else if (kind === 'suspended') {
      title = 'This workspace is not active';
      body = detail ? esc(detail) : 'Please get in touch and we will sort it out.';
      cta = '';
    } else {
      title = 'The designer is not on this plan';
      body = 'The site designer is part of a paid ' + esc(who) + ' account. '
           + 'Your workspace does not include it yet.';
      cta = '';
    }

    var mail = b.support || 'dev@clearsky-usa.com';
    d.innerHTML =
      '<div style="max-width:520px;text-align:center">'
      + '<div style="font-size:23px;font-weight:800;margin-bottom:12px">' + title + '</div>'
      + '<div style="font-size:15px;color:#8BA3C4;margin-bottom:22px">' + body + '</div>'
      + (kind === 'signed-out'
          ? '<button id="omega-gate-in" style="background:' + esc(b.accent) + ';color:#fff;border:0;'
            + 'border-radius:9px;padding:12px 24px;font:700 15px inherit;cursor:pointer">' + esc(cta) + '</button>'
          : '')
      + '<div style="margin-top:20px;font-size:13px;color:#8BA3C4">'
      +   '<a href="mailto:' + esc(mail) + '?subject=' + encodeURIComponent('Designer access')
      +   '" style="color:' + esc(b.accent) + '">Ask about an account</a>'
      + '</div></div>';

    var btn = document.getElementById('omega-gate-in');
    if (btn) btn.onclick = function () {
      /* The editor has its own sign-in button; use it rather than minting a
         second auth flow that would drift from it. */
      try {
        var s = document.getElementById('sign-in-btn');
        if (s) { lift(); s.click(); return; }
      } catch (e) {}
      try { global.location.href = '/?next=' + encodeURIComponent(global.location.pathname + global.location.search); }
      catch (e2) {}
    };
  }

  function allow(ctx) {
    lift();
    try {
      global.OMEGA_EDITOR_ACCESS = ctx;
      if (global.dispatchEvent) global.dispatchEvent(new CustomEvent('omega:editor-access', { detail: ctx }));
    } catch (e) {}
  }

  /* ── The decision ──────────────────────────────────────────────────────
     Reads the caller's OWN org record and billing — both of which the rules
     already let a member read, so this needs no widening and no mirror. */
  function decide(user) {
    var email = String(user.email || '').toLowerCase();
    var org = orgOf(email);
    if (user.emailVerified === true && STAFF.indexOf(org) >= 0) return Promise.resolve(allow({ org: org, staff: true, reason: 'staff' }));
    if (!org) { refuse('signed-out'); return Promise.resolve(); }

    var fb = global.firebase;
    if (!fb || !fb.firestore || !fb.apps || !fb.apps.length) {
      /* No Firestore on the page at all. Signed in is the requirement that
         matters and it is met; refusing here would lock people out over a
         script that failed to load. */
      refuse('plan', 'Workspace access could not be checked. Retry when connected.');
      return Promise.resolve();
    }

    var db = fb.firestore();
    return Promise.all([
      db.collection('omega_orgs').doc(org).get(),
      db.collection('omega_orgs').doc(org).collection('billing').doc('current').get()
    ]).then(function (r) {
      var exists = r[0] && r[0].exists;
      var o = exists ? (r[0].data() || {}) : null;
      var bill = (r[1] && r[1].exists) ? (r[1].data() || {}) : null;

      if (bill && bill.packaged === true) {
        return user.getIdToken().then(function (token) {
          return global.fetch('/api/package-access', { headers: { Authorization: 'Bearer ' + token }, cache: 'no-store' });
        }).then(function (response) {
          if (!response.ok) throw new Error('Package access unavailable');
          return response.json();
        }).then(function (view) {
          if (view.packaged !== true || !Array.isArray(view.toolAccess) || view.toolAccess.indexOf('editor') < 0) return refuse('plan');
          return allow({ org: org, packaged: true, readOnly: view.readOnly, reason: 'package' });
        }).catch(function () { return refuse('plan', 'Package access could not be checked. Retry when connected.'); });
      }

      /* ABSENT COUNTS AS ACTIVE — see the header. */
      if (!exists) return allow({ org: org, reason: 'no-record' });

      var status = String(o.status || 'active');
      if (BLOCKED_STATUS.indexOf(status) >= 0) {
        return refuse(status === 'pending' ? 'pending' : 'suspended', o.statusNote || '');
      }

      /* An explicit switch-off is the only entitlement refusal. A missing
         billing record is a tenant nobody has seeded, not a tenant on no
         plan, and treating the two the same locks out real customers. */
      var ov = (bill && bill.toolOverrides) || {};
      if (ov.editor === false) return refuse('plan');

      // Lite tenants land in the small shell even from an old full-editor link.
      // The embedded engine is still the same file; no second editor is copied.
      if (bill && bill.editorLite && bill.editorLite.enabled === true) {
        var inLite = false;
        try { inLite = global.parent !== global && /^\/editor-lite(?:\.html)?\/?$/.test(global.parent.location.pathname) && global.parent.location.origin === global.location.origin; } catch (e) {}
        if (!inLite) {
          var q = new URLSearchParams(global.location.search); q.set('org', org);
          global.location.replace('/editor-lite.html?' + q.toString());
          return;
        }
      }

      return allow({ org: org, tier: (bill && bill.tier) || null, reason: 'active' });
    }, function () {
      /* The read failed — offline, rules hiccup, no network. Signed in is
         still true, and a designer that refuses on a flaky read is a support
         call from somebody who is paying. */
      return refuse('plan', 'Workspace access could not be checked. Retry when connected.');
    });
  }

  function start() {
    shield();
    var began = Date.now();
    if (new URLSearchParams(global.location.search).get('customerEngine') === '1') {
      // Presentation bridge only. Actual buyer data and module authorization
      // are rechecked by /api/customer-design on every read/write/build.
      try {
        if (global.parent !== global && global.parent.location.origin === global.location.origin &&
            /^\/editor-lite(?:\.html)?\/?$/.test(global.parent.location.pathname) &&
            global.parent.OmegaBuyerEngine && global.parent.OmegaBuyerEngine.authorized === true && global.parent.OmegaBuyerEngine.packageAccess && global.parent.OmegaBuyerEngine.packageAccess.packaged === true) {
          allow({ reason: 'customer-drawing-engine' }); return;
        }
      } catch (e) {}
      refuse('signed-out'); return;
    }
    (function watch() {
      var fb = global.firebase;
      var u = null;
      try { u = fb && fb.auth && fb.apps && fb.apps.length ? fb.auth().currentUser : null; } catch (e) {}
      if (u) { decide(u); return; }

      /* Firebase reports null before it has finished restoring a session, so
         a null is not a signed-out user until it has had time to be one.
         Same reasoning as omega-tenant.js's hadSession() guard. */
      if (Date.now() - began > MAX_WAIT_MS) { refuse('signed-out'); return; }
      setTimeout(watch, 350);
    })();

    /* And react to a later sign-in or sign-out without a reload. */
    (function bind(tries) {
      try {
        if (global.firebase && firebase.auth && firebase.apps && firebase.apps.length) {
          firebase.auth().onAuthStateChanged(function (user) {
            if (user) decide(user); else refuse('signed-out');
          });
          return;
        }
      } catch (e) {}
      if ((tries || 0) < 40) setTimeout(function () { bind((tries || 0) + 1); }, 300);
    })(0);
  }

  if (global.document) {
    if (document.body) start();
    else document.addEventListener('DOMContentLoaded', start);
  }

  global.OmegaEditorGate = {
    start: start, decide: decide, refuse: refuse, allow: allow,
    orgOf: orgOf, BLOCKED_STATUS: BLOCKED_STATUS
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = global.OmegaEditorGate;
})(typeof window !== 'undefined' ? window : this);
