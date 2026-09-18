/* ═══════════════════════════════════════════════════════════════════════════════
   api/_lib/embed.js — authorise a PUBLIC, UNAUTHENTICATED embed request
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   ─────────────────────────────────────────────────────────────────────────────
   WHY THIS EXISTS, AND WHY IT IS NOT _lib/admin.js
   ─────────────────────────────────────────────────────────────────────────────
   Every other function in /api/ starts with A.authenticate(req) and refuses
   without a Firebase ID token. That is correct for the product: everyone who
   uses OMEGA has an account.

   The white-label embed inverts that. The person sizing a battery on
   cleancell.us is Clean Cell's CUSTOMER. They have no OMEGA account, they must
   never be asked to make one, and they must never learn that OMEGA exists.
   There is no token to verify. So the caller we authenticate is not a person —
   it is an INSTALLATION.

   ─────────────────────────────────────────────────────────────────────────────
   WHAT AN EMBED KEY IS, AND WHAT IT IS HONESTLY WORTH
   ─────────────────────────────────────────────────────────────────────────────
       embed_keys/{key}  { orgId, label, active, origins[], scopes[] }

   The key is PUBLISHABLE. It ships inside a page served to the public, the
   same way a Stripe pk_live_ key does. Anybody who views source has it. The
   parent origin the page reports is likewise client-supplied and a determined
   caller can send whatever they like.

   SO THE KEY IS NOT A SECURITY BOUNDARY AND THIS FILE DOES NOT PRETEND IT IS.
   Writing "origin check" in a comment and moving on is how a publishable
   credential ends up load-bearing. What actually holds:

     1. NOTHING CONFIDENTIAL IS REACHABLE. An embed request can read the
        tenant's public branding and a product list the tenant chose to
        publish. It cannot read a project, a member, a price input, a margin,
        another tenant, or its own key's record. There is no endpoint that
        would return one — not "there is one but it checks a flag".

     2. PRICING AND SIZING STAY ON THE SERVER, and return RESULTS, never
        inputs. CLAUDE.md's IP section is the rule; a public surface is the
        one place it cannot be bent, because the caller is a stranger.

     3. AN ORDER IS A REQUEST, NOT A TRANSACTION. /api/embed-order creates a
        row with status 'new' that a human confirms. It takes no payment, and
        it cannot set price, status, or fulfilment fields — see that file.
        The worst a forged call achieves is a junk row in a queue somebody
        reads, which is the same thing a contact form achieves.

     4. RATE LIMITS, so the junk row does not become a million of them.

   The origin allowlist and the key are therefore ACCOUNTING AND HYGIENE: they
   tell us which installation a lead came from, they let us switch one off
   without touching the others, and they keep a copied snippet from quietly
   running on a site we have never heard of. Real value, correctly labelled.

   ─────────────────────────────────────────────────────────────────────────────
   RATE LIMITING IS PER WARM INSTANCE
   ─────────────────────────────────────────────────────────────────────────────
   The counter below lives in module memory. Vercel runs many instances, so
   the real ceiling is (limit × instances) and a burst spread across cold
   starts is not limited at all. That is a deliberate trade: a Firestore
   write per request to count requests costs more than the abuse it prevents
   at this volume, and this stops the case that actually happens — one broken
   loop on one page hammering one instance.

   THE DURABLE LIMIT IS ON ORDERS, NOT READS, and it is enforced in
   api/embed-order.js against a counter document, because that is the call
   with a consequence. Do not move that one in here.
   ═══════════════════════════════════════════════════════════════════════════════ */
'use strict';
var A = require('./admin');

/* ── Rate limiting ─────────────────────────────────────────────────────── */
var WINDOW_MS = 60000;
var buckets = {};          /* key -> { n, resetAt } */
var BUCKET_CAP = 5000;     /* keys tracked at once; see sweep() */

function sweep(now) {
  /* An unbounded map keyed by caller-supplied strings is a memory leak with
     a stranger's hand on the tap. Swept when it gets large rather than on a
     timer, because a warm instance with no traffic should do nothing. */
  var ks = Object.keys(buckets);
  if (ks.length < BUCKET_CAP) return;
  for (var i = 0; i < ks.length; i++) {
    if (buckets[ks[i]].resetAt <= now) delete buckets[ks[i]];
  }
}

function rateLimit(id, limit) {
  var now = Date.now();
  sweep(now);
  var b = buckets[id];
  if (!b || b.resetAt <= now) { b = buckets[id] = { n: 0, resetAt: now + WINDOW_MS }; }
  b.n++;
  if (b.n > limit) {
    var wait = Math.ceil((b.resetAt - now) / 1000);
    throw A.httpError(429, 'too many requests — retry in ' + wait + 's');
  }
}

/* ── Origin handling ───────────────────────────────────────────────────── */

function normOrigin(v) {
  var s = String(v || '').trim();
  if (!s) return '';
  /* A Referer is a full URL; an Origin is a scheme+host+port. Reduce both to
     an origin so one comparison serves. */
  var m = /^(https?:\/\/[^/?#]+)/i.exec(s);
  return m ? m[1].toLowerCase() : '';
}

/* Where the request says it came from, most trustworthy first.

   X-Omega-Parent is what the embed page puts there after reading
   window.location.ancestorOrigins (or falling back to document.referrer).
   It exists because the iframe is served from OUR origin, so its fetches are
   SAME-ORIGIN and the browser sends us our own Origin — which tells us
   nothing about whose site the widget is on. The parent has to be reported,
   and reported values are claims. Labelled as such everywhere below. */
function claimedOrigin(req) {
  var h = req.headers || {};
  return normOrigin(h['x-omega-parent'])
      || normOrigin(h.origin)
      || normOrigin(h.referer)
      || '';
}

/* An allowlist entry matches a host exactly, or a whole subdomain tree when
   written as a leading dot: '.cleancell.us' admits www.cleancell.us and
   shop.cleancell.us but NOT evilcleancell.us — the check is on a dot
   boundary, which is the bug this shape exists to avoid. */
function originAllowed(list, origin) {
  if (!list || !list.length) return true;      /* no list = no restriction */
  if (!origin) return false;
  var host = origin.replace(/^https?:\/\//, '');
  for (var i = 0; i < list.length; i++) {
    var e = String(list[i] || '').trim().toLowerCase();
    if (!e) continue;
    if (e.charAt(0) === '.') {
      var suffix = e;                           /* '.cleancell.us' */
      var bare = e.slice(1);                    /* 'cleancell.us'  */
      if (host === bare || host.slice(-suffix.length) === suffix) return true;
      continue;
    }
    if (normOrigin(e) === origin || e.replace(/^https?:\/\//, '') === host) return true;
  }
  return false;
}

/* ── Key resolution ────────────────────────────────────────────────────── */

function keyFrom(req) {
  var h = req.headers || {};
  var q = req.query || {};
  var b = req.body || {};
  var k = h['x-omega-embed-key'] || q.k || q.key || b.key || '';
  k = String(k).trim();
  /* Shape-checked before it is used as a document id: a slash would address
     a different collection, and a 4 KB string is not a key. */
  if (!/^omega_pk_[a-z0-9_]{8,96}$/.test(k)) return '';
  return k;
}

/* Resolve an embed request into everything a handler needs.

   Resolves { key, keyId, orgId, org, billing, whiteLabel, embed, origin,
              originTrusted, scopes }
   Rejects with 401/403/404/429 and a message safe to show a stranger. */
function resolve(req, opts) {
  opts = opts || {};
  var limit = opts.limit || 60;
  var scope = opts.scope || null;

  return Promise.resolve().then(function () {
    var key = keyFrom(req);
    if (!key) throw A.httpError(401, 'missing or malformed embed key');

    /* Limited BEFORE the reads, so a flood costs us no Firestore. */
    rateLimit(key, limit);

    var db = A.db();
    return db.collection('embed_keys').doc(key).get().then(function (ks) {
      if (!ks.exists) throw A.httpError(403, 'this embed key is not recognised');
      var k = ks.data() || {};
      if (k.active === false) throw A.httpError(403, 'this embed key has been disabled');

      var orgId = String(k.orgId || '').toLowerCase();
      if (!orgId) throw A.httpError(500, 'embed key has no orgId');

      var origin = claimedOrigin(req);
      var allowed = originAllowed(k.origins || [], origin);
      if (!allowed) {
        /* The refusal names neither the allowlist nor the tenant. A stranger
           probing a key learns only that this origin is not it. */
        throw A.httpError(403, 'this embed is not authorised for ' + (origin || 'an unknown site'));
      }

      if (scope) {
        var scopes = k.scopes || [];
        if (scopes.length && scopes.indexOf(scope) < 0) {
          throw A.httpError(403, 'this embed key does not include ' + scope);
        }
      }

      return Promise.all([
        db.collection('omega_orgs').doc(orgId).get(),
        A.billingOf(orgId)
      ]).then(function (r) {
        var os = r[0], billing = r[1] || {};
        if (!os.exists) throw A.httpError(404, 'workspace not found');
        var org = os.data() || {};

        /* A suspended or cancelled tenant's public storefront goes dark with
           the rest of their account. Leaving it up would have us taking
           orders on behalf of somebody we have stopped serving. */
        if (org.status && org.status !== 'active') {
          throw A.httpError(403, 'this storefront is not currently available');
        }

        var wl = org.whiteLabel || {};
        /* The embed is a paid capability. Gated on the tenant record rather
           than on the key, so switching it off in one place switches off
           every installation — and so a key that outlives a downgrade stops
           working instead of quietly continuing to serve. */
        var addons = billing.addons || [];
        var overrides = billing.toolOverrides || {};
        var entitled = overrides.whitelabel === true
          || (overrides.whitelabel !== false
              && (addons.indexOf('whitelabel') >= 0 || wl.enabled === true));
        if (!entitled) throw A.httpError(403, 'this storefront is not enabled on this account');

        return {
          key: key,
          keyId: key.slice(-8),          /* for logs and order provenance */
          keyLabel: k.label || '',
          orgId: orgId,
          org: org,
          billing: billing,
          whiteLabel: wl,
          embed: wl.embed || {},
          origin: origin,
          /* TRUE only means "the caller's claim matched the allowlist". It is
             not proof of provenance. Named this way so no reader mistakes it
             for one. */
          originTrusted: allowed && !!origin && !!(k.origins || []).length,
          scopes: k.scopes || []
        };
      });
    });
  });
}

/* ── EVERY EMBED ENDPOINT GOES THROUGH HERE ──────────────────────────────
   Two jobs, and the second one is not cosmetic.

   1 · no-store, set in ONE place so no endpoint can forget it.

   2 · 5xx MESSAGES ARE REPLACED. A.handler forwards err.message with the
       status, which is right for the product: a signed-in engineer seeing
       "server has no Firestore credential (FIREBASE_SERVICE_ACCOUNT is not
       set)" knows exactly who to call.

       On THIS surface the reader is a member of the public, on a customer's
       own website, and that sentence names our infrastructure and its
       configuration state. A.db() throws exactly that when the deployment has
       no service account — which api/_lib/admin.js records as a state
       production has actually been in for weeks — so this is the normal
       failure, not an exotic one.

       4xx messages pass through untouched: they are written for this reader
       and are the whole point ("Demand charge looks wrong — enter $/kW-month",
       "This proposal has expired"). Only 500-and-above is replaced, and the
       real error is logged where we can read it. */
function handler(fn) {
  return A.handler(function (req, res) {
    res.setHeader('Cache-Control', 'private, no-store');
    return Promise.resolve().then(function () {
      return fn(req, res);
    })['catch'](function (err) {
      var status = err && err.status;
      if (!status || status >= 500) {
        console.error('[embed] ' + (req.url || '') + ' →', err);
        throw A.httpError(status && status >= 500 ? status : 500,
          'This is temporarily unavailable. Please try again shortly, or contact us directly.');
      }
      throw err;
    });
  });
}

module.exports = {
  resolve: resolve,
  handler: handler,
  /* TEST SEAM. The bucket lives in module memory, so a suite that exercises
     more than one case against one key trips its own limiter and every
     assertion after the first minute's worth reads as a 429. Exported rather
     than worked around with a key per case, because the limiter's behaviour
     is itself under test (scripts/tests/tembedlayout.js). Not called by any
     handler. */
  _resetLimits: function () { buckets = {}; },
  rateLimit: rateLimit,
  normOrigin: normOrigin,
  originAllowed: originAllowed,
  claimedOrigin: claimedOrigin,
  keyFrom: keyFrom
};
