#!/usr/bin/env node
/* The staff white-label preview changes the PAINT and never the SCOPE.
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   ?wlpreview=cleancell.us paints a signed-in ClearSky page as one tenant, so
   a white label can be demonstrated, reviewed and supported by the people who
   sold it — orgId IS the email domain, so nobody at ClearSky has an account
   that resolves to a customer's workspace.

   THE FAILURE THIS FILE EXISTS FOR is one line in omega-whitelabel.js:

       if (!c.tenant) c.tenant = { orgId: mine || org };
                                            ^^^^

   Written as `org` instead of `mine`, the preview stops being a branding
   feature and becomes an impersonation feature. On the editor —  which has no
   omega-tenant.js, so that line is where CLEARSKY_CONFIG.tenant is BORN —
   every project read, layout write and toolData key would move to the
   previewed tenant's org. Nothing throws. The page looks right. A staff user
   demonstrating Clean Cell would be writing into Clean Cell's workspace.

   So the assertion below is not "the preview works". It is "the previewed org
   reached whiteLabel and did NOT reach orgId", asserted separately on the
   two cases that differ: a page with a tenant already resolved, and a page
   where this code creates it.

   Also guards:
     · the staff gate on the parameter (a tenant may not paint as anyone)
     · the shape check (the value becomes a Firestore document id)
     · the catalogue following the preview, because a white-label preview that
       offers a competitor's batteries has demonstrated nothing
     · whitelabel-setup.html: no cost basis, no tenant_public, merge on every
       write, and a key minted from crypto rather than Math.random
     · SF_KEYS in that page against STOREFRONT_KEYS in seed-omega-orgs.js,
       because two hand-kept copies of one allowlist is how a field silently
       stops reaching Firestore

   node scripts/test-wl-preview.js */
'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm');
var ROOT = path.join(__dirname, '..');

var pass = 0, fail = 0;
function ok(name, cond, got) {
  if (cond) { pass++; return; }
  fail++; console.error('  FAIL ' + name + (got !== undefined ? '  got: ' + JSON.stringify(got) : ''));
}

var SRC = fs.readFileSync(path.join(ROOT, 'omega-whitelabel.js'), 'utf8');

/* ── A browser, minimally ────────────────────────────────────────────────
   Enough DOM for setTokens/paintMarks/paintPreviewBanner to run without
   throwing, and a Firestore that answers ONE document — because the whole
   question is which document was asked for and where its contents landed. */
function makeEnv(opts) {
  opts = opts || {};
  var appended = [];
  var byId = {};

  function el(tag) {
    var e = {
      tagName: (tag || 'div').toUpperCase(),
      id: '', className: '', textContent: '', style: {
        cssText: '', setProperty: function (k, v) { this[k] = v; }
      },
      _attrs: {},
      setAttribute: function (k, v) { this._attrs[k] = String(v); if (k === 'id') this.id = String(v); },
      getAttribute: function (k) { return Object.prototype.hasOwnProperty.call(this._attrs, k) ? this._attrs[k] : null; },
      hasAttribute: function (k) { return Object.prototype.hasOwnProperty.call(this._attrs, k); },
      appendChild: function (c) { appended.push(c); if (c.id) byId[c.id] = c; c.parentNode = this; return c; },
      removeChild: function (c) {
        for (var i = 0; i < appended.length; i++) if (appended[i] === c) { appended.splice(i, 1); break; }
        if (c.id) delete byId[c.id];
        return c;
      }
    };
    return e;
  }

  var body = el('body');
  var docEl = el('html');
  var document = {
    documentElement: docEl,
    body: body,
    createElement: el,
    getElementById: function (id) { return byId[id] || null; },
    querySelectorAll: function () { return []; },
    addEventListener: function () {}
  };

  var reads = [];
  function docRef(coll, id) {
    return {
      get: function () {
        reads.push(coll + '/' + id);
        var d = (opts.docs || {})[coll + '/' + id];
        return Promise.resolve({ exists: !!d, data: function () { return d || {}; } });
      }
    };
  }
  var firebase = {
    apps: [{}],
    auth: function () {
      return {
        currentUser: opts.email ? { email: opts.email, uid: 'u1' } : null,
        onAuthStateChanged: function (cb) { cb(opts.email ? { email: opts.email, uid: 'u1' } : null); }
      };
    },
    firestore: function () {
      return { collection: function (c) { return { doc: function (id) { return docRef(c, id); } }; } };
    }
  };

  var win = {
    CLEARSKY_CONFIG: opts.config || { adminDomains: ['csebuilders.com', 'clearsky-usa.com'] },
    location: { search: opts.search || '', hostname: 'silmarillion.clearskyomega.com' },
    document: document,
    firebase: firebase,
    addEventListener: function () {},
    setInterval: function () { return 0; },
    clearInterval: function () {},
    Promise: Promise
  };
  win.window = win;
  if (opts.brand) win.OmegaBrand = opts.brand;

  var ctx = vm.createContext(win);
  vm.runInContext(SRC, ctx, { filename: 'omega-whitelabel.js' });
  return { win: win, WL: win.OmegaWhiteLabel, appended: appended, reads: reads, body: body, docEl: docEl };
}

var CC = {
  name: 'Clean Cell',
  logoUrl: '/tenants/cleancell/logo.png',
  whiteLabel: {
    enabled: true,
    platformName: 'Clean Cell Power Platform',
    shortName: 'Clean Cell',
    attribution: 'powered-by'
  }
};
var MINE = { name: 'ClearSky Energy Solutions', whiteLabel: null };
var DOCS = { 'omega_orgs/cleancell.us': CC, 'omega_orgs/csebuilders.com': MINE };

/* ── 1 · The parameter, and who may use it ───────────────────────────── */
(function () {
  var e = makeEnv({ search: '', email: 'thomas@csebuilders.com', docs: DOCS });
  ok('no parameter, no preview', e.WL.previewOrg() === '', e.WL.previewOrg());
})();

(function () {
  var e = makeEnv({ search: '?wlpreview=cleancell.us', email: 'thomas@csebuilders.com', docs: DOCS });
  ok('staff may preview a tenant', e.WL.previewOrg() === 'cleancell.us', e.WL.previewOrg());
  ok('staff domain is recognised', e.WL.isStaffDomain() === true);
})();

(function () {
  var e = makeEnv({ search: '?wlpreview=CLEANCELL.US', email: 'thomas@clearsky-usa.com', docs: DOCS });
  ok('the value is lowercased', e.WL.previewOrg() === 'cleancell.us', e.WL.previewOrg());
})();

/* THE GATE, restated: the rules refuse the read, and this refuses the paint.
   A tenant who finds the parameter in a URL must not get somebody else's
   brand — not because it would leak anything, but because a page that paints
   as another company on request is a page that can be screenshotted. */
(function () {
  var e = makeEnv({ search: '?wlpreview=cleancell.us', email: 'bob@walters.com', docs: DOCS });
  ok('a TENANT may not preview another tenant', e.WL.previewOrg() === '', e.WL.previewOrg());
  ok('a tenant domain is not staff', e.WL.isStaffDomain() === false);
})();

(function () {
  var e = makeEnv({ search: '?wlpreview=cleancell.us', email: '', docs: DOCS });
  ok('signed out, no preview', e.WL.previewOrg() === '', e.WL.previewOrg());
})();

/* The value becomes a Firestore document id. A slash addresses a different
   collection; the shape check is what stops that. */
[
  ['a path is refused',            '?wlpreview=cleancell.us%2Fbilling%2Fcurrent'],
  ['a bare word is refused',       '?wlpreview=admin'],
  ['a leading dot is refused',     '?wlpreview=.cleancell.us'],
  ['an empty value is refused',    '?wlpreview='],
  ['a wildcard is refused',        '?wlpreview=*'],
  ['a parent traversal is refused','?wlpreview=..%2F..%2Fomega_staff']
].forEach(function (c) {
  var e = makeEnv({ search: c[1], email: 'thomas@csebuilders.com', docs: DOCS });
  ok(c[0], e.WL.previewOrg() === '', e.WL.previewOrg());
});

/* adminDomains comes from omega-brand.js when it is on the page, so there is
   ONE list of who ClearSky is rather than a second one in this file. */
(function () {
  var e = makeEnv({
    search: '?wlpreview=cleancell.us', email: 'x@partner-ops.example',
    config: {},
    brand: { adminDomains: function () { return ['partner-ops.example']; } },
    docs: DOCS
  });
  ok('omega-brand.js adminDomains() is honoured', e.WL.previewOrg() === 'cleancell.us', e.WL.previewOrg());
})();

/* ── 2 · PAINT vs SCOPE — the reason this file exists ────────────────── */

/* 2a · A page with NO tenant resolved. This is the editor, and it is the
   dangerous case: CLEARSKY_CONFIG.tenant is created here. */
(function () {
  var e = makeEnv({ search: '?wlpreview=cleancell.us', email: 'thomas@csebuilders.com', docs: DOCS });
  return e.WL.hydrate().then(function () {
    var t = e.win.CLEARSKY_CONFIG.tenant || {};
    ok('the previewed brand is painted',
       t.whiteLabel && t.whiteLabel.platformName === 'Clean Cell Power Platform', t.whiteLabel);
    ok('the previewed NAME is painted', t.clientName === 'Clean Cell', t.clientName);
    ok('platformName() answers as the previewed tenant',
       e.WL.platformName() === 'Clean Cell Power Platform', e.WL.platformName());

    /* ★ THE ASSERTION. */
    ok('★ orgId stays the SIGNED-IN org, not the previewed one',
       t.orgId === 'csebuilders.com', t.orgId);
    ok('the preview is recorded for anything that wants to know',
       t.wlPreviewOf === 'cleancell.us', t.wlPreviewOf);
    ok('resolveOrg() is the real org, always',
       e.WL.resolveOrg() === 'csebuilders.com', e.WL.resolveOrg());
    /* boot fires its own hydrate the moment sign-in resolves — that IS the
       feature, so the assertion is not "one read" but "no OTHER org". */
    var distinct = e.reads.filter(function (r, i) { return e.reads.indexOf(r) === i; });
    ok('no org but the previewed one was read',
       distinct.join(',') === 'omega_orgs/cleancell.us', distinct);
  });
})();

/* 2b · A page that already resolved a tenant (orders.html, projects.html).
   The preview must repaint it and leave orgId exactly as omega-tenant.js
   set it. */
(function () {
  var e = makeEnv({
    search: '?wlpreview=cleancell.us', email: 'thomas@csebuilders.com', docs: DOCS,
    config: {
      adminDomains: ['csebuilders.com'],
      tenant: { orgId: 'csebuilders.com', clientName: 'ClearSky', whiteLabel: null }
    }
  });
  return e.WL.hydrate().then(function () {
    var t = e.win.CLEARSKY_CONFIG.tenant;
    ok('an already-resolved tenant is repainted',
       t.whiteLabel && t.whiteLabel.shortName === 'Clean Cell', t.whiteLabel);
    ok('★ an already-resolved orgId is not moved', t.orgId === 'csebuilders.com', t.orgId);
  });
})();

/* 2c · No preview: hydrate reads the signed-in user's OWN record. The
   ordinary path has to keep working, or the preview has broken the feature
   it was added to support. */
(function () {
  var e = makeEnv({ search: '', email: 'thomas@csebuilders.com', docs: DOCS });
  return e.WL.hydrate().then(function () {
    ok('without a preview, own org is read',
       e.reads.join(',') === 'omega_orgs/csebuilders.com', e.reads);
    ok('own org with no whiteLabel is not white-labelled', e.WL.active() === false);
    ok('the platform keeps its own name', e.WL.platformName() === 'ClearSky-OMEGA', e.WL.platformName());
  });
})();

/* 2d · A non-staff user who passes the parameter reads their OWN record.
   Not an error — the parameter is simply not honoured. */
(function () {
  var e = makeEnv({
    search: '?wlpreview=cleancell.us', email: 'bob@walters.com',
    docs: { 'omega_orgs/walters.com': { name: 'Walters' } }
  });
  return e.WL.hydrate().then(function () {
    ok('a tenant passing the parameter reads only their own org',
       e.reads.join(',') === 'omega_orgs/walters.com', e.reads);
    ok('and is not painted as anybody else', e.WL.platformName() === 'ClearSky-OMEGA', e.WL.platformName());
  });
})();

/* 2e · An explicit argument still wins, so callers that name an org are
   unaffected by a preview in the URL. */
(function () {
  var e = makeEnv({ search: '?wlpreview=cleancell.us', email: 'thomas@csebuilders.com', docs: DOCS });
  return e.WL.hydrate('csebuilders.com').then(function () {
    ok('an explicit orgId outranks the preview',
       e.reads[e.reads.length - 1] === 'omega_orgs/csebuilders.com', e.reads);
  });
})();

/* ── 3 · The banner ──────────────────────────────────────────────────────
   A staff user looking at another company's brand must never be in doubt
   about which of the two things they are looking at. Painted by this file
   rather than shipped per page, because a page that forgot it is a page
   where the doubt exists. */
(function () {
  var e = makeEnv({ search: '?wlpreview=cleancell.us', email: 'thomas@csebuilders.com', docs: DOCS });
  e.WL.apply();
  var bar = e.win.document.getElementById('omega-wl-preview-bar');
  ok('a preview shows a banner', !!bar);
  ok('the banner names the previewed org', bar && /cleancell\.us/.test(bar.textContent), bar && bar.textContent);
  ok('the banner names the org that owns the data',
     bar && /csebuilders\.com/.test(bar.textContent), bar && bar.textContent);
  ok('the banner says how to leave', bar && /wlpreview/.test(bar.textContent));
  ok('the banner is fixed and on top',
     bar && /position:fixed/.test(bar.style.cssText) && /z-index:\d{6,}/.test(bar.style.cssText),
     bar && bar.style.cssText);
})();

(function () {
  var e = makeEnv({ search: '', email: 'thomas@csebuilders.com', docs: DOCS });
  e.WL.apply();
  ok('no preview, no banner', e.win.document.getElementById('omega-wl-preview-bar') === null);
})();

(function () {
  var e = makeEnv({ search: '?wlpreview=cleancell.us', email: 'bob@walters.com', docs: DOCS });
  e.WL.apply();
  ok('a tenant gets no banner either', e.win.document.getElementById('omega-wl-preview-bar') === null);
})();

/* ── 4 · The catalogue follows the preview ───────────────────────────────
   Specifying a competitor on a manufacturer's own platform is the bug
   omega-bess-products.js was written to fix. A preview that paints the chrome
   and then offers Gotion containers has demonstrated nothing. */
(function () {
  /* Loaded into a window, the way it ships. require()ing it works — the file
     has the usual `typeof window !== 'undefined' ? window : this` tail — but
     in Node that `this` is module.exports, so a stub on Node's `global` is
     invisible to it and every assertion here would pass on ''. */
  var BSRC = fs.readFileSync(path.join(ROOT, 'omega-bess-products.js'), 'utf8');
  function bess(preview, tenantOrg) {
    var win = {
      CLEARSKY_CONFIG: tenantOrg ? { tenant: { orgId: tenantOrg } } : {},
      OmegaWhiteLabel: { previewOrg: function () { return preview; } },
      document: { addEventListener: function () {} },
      addEventListener: function () {},
      Promise: Promise
    };
    win.window = win;
    var ctx = vm.createContext(win);
    vm.runInContext(BSRC, ctx, { filename: 'omega-bess-products.js' });
    return win.OmegaBessProducts;
  }

  var P = bess('cleancell.us', 'csebuilders.com');
  ok('catalogOrg() follows the preview', P.catalogOrg() === 'cleancell.us', P.catalogOrg());
  /* ★ The same paint/scope split as hydrate(), asserted on the other file:
     the catalogue moves, the data scope does not. */
  ok('★ orgId() is unmoved by a preview', P.orgId() === 'csebuilders.com', P.orgId());

  var Q = bess('', 'csebuilders.com');
  ok('catalogOrg() is the signed-in org without a preview',
     Q.catalogOrg() === 'csebuilders.com', Q.catalogOrg());
  ok('orgId() never follows the preview — it is the SCOPE',
     Q.orgId() === 'csebuilders.com', Q.orgId());

  /* No OmegaWhiteLabel on the page at all (a tool that loads this file alone)
     must still resolve the signed-in org rather than throw. */
  var win = { CLEARSKY_CONFIG: { tenant: { orgId: 'walters.com' } }, Promise: Promise };
  win.window = win;
  var ctx = vm.createContext(win);
  vm.runInContext(BSRC, ctx, { filename: 'omega-bess-products.js' });
  ok('with no white-label layer present, catalogOrg() is still the own org',
     win.OmegaBessProducts.catalogOrg() === 'walters.com', win.OmegaBessProducts.catalogOrg());
})();

/* ── 5 · whitelabel-setup.html ───────────────────────────────────────────
   A staff browser page that writes four control-plane documents. Read as
   text, because the interesting properties are about what it does NOT do. */
var SETUP = fs.readFileSync(path.join(ROOT, 'whitelabel-setup.html'), 'utf8');

ok('the setup page refuses a cost basis',
   /COST_BASIS\s*=\s*\['capexPerKwh',\s*'capexPerKw'\]/.test(SETUP));
ok('and blocks publishing when it finds one',
   /leak\.length[\s\S]{0,400}\$\('publish'\)\.disabled\s*=\s*true/.test(SETUP));
ok('a cost basis is never in its write payload',
   SETUP.indexOf('capexPerKwh:') < 0 && SETUP.indexOf('capexPerKw:') < 0);

/* tenant_public is `allow read: if true`. This page must not write it, because
   the ONE allowlist that decides what may go there lives in
   api/_lib/whitelabel.js and a browser page cannot require() it. */
ok('the setup page never writes tenant_public',
   !/collection\(\s*['"]tenant_public['"]/.test(SETUP));
ok('and says why in the plan', /tenant_public/.test(SETUP) && /api\/_lib\/whitelabel\.js/.test(SETUP));

/* Nothing that prices an account. */
['amountDue', 'paymentLink', 'stripeCustomerId', 'lastPaidAt', 'autopay'].forEach(function (k) {
  ok('the setup page does not write ' + k, SETUP.indexOf(k + ':') < 0);
});

/* merge:true on every set, so a value somebody tuned in the console survives
   a re-publish. Three documents, three merges. */
ok('every org write merges', (SETUP.match(/\{\s*merge:\s*true\s*\}/g) || []).length >= 3,
   (SETUP.match(/\{\s*merge:\s*true\s*\}/g) || []).length);

/* A guessable key lets a stranger file an order against a tenant. */
ok('the key is minted from crypto', /getRandomValues/.test(SETUP));
/* The call, not the word — the comment above it explains why it is absent. */
ok('and never from Math.random', !/Math\.random\s*\(/.test(SETUP));
ok('the key carries who minted it', /mintedBy:/.test(SETUP) && /mintedVia:/.test(SETUP));
ok('an existing active key is reused, not duplicated',
   /if\s*\(KEYDOC\)\s*return Promise\.resolve\(KEYDOC\.id\)/.test(SETUP));
ok('the key shape matches api/_lib/embed.js', /'omega_pk_live_'/.test(SETUP));

/* The staff check is for the screen; the rules are the control. Asserted so
   nobody later reads the JavaScript as the gate. */
ok('the setup page reads ONE list of who is staff',
   /OmegaBrand\.adminDomains\(\)/.test(SETUP));
ok('and says the database is the gate',
   /permission-denied/.test(SETUP) && /that refusal is the gate/.test(SETUP));

/* ── 6 · Two hand-kept copies of one allowlist ───────────────────────────
   SF_KEYS in the page against STOREFRONT_KEYS in the seed script. Drift here
   is silent: a field stops reaching Firestore and the storefront quietly
   falls back to a default. */
(function () {
  function listFrom(src, name) {
    var i = src.indexOf('var ' + name);
    if (i < 0) return null;
    var j = src.indexOf('[', i), depth = 0, end = -1;
    for (var k = j; k < src.length; k++) {
      if (src[k] === '[') depth++;
      else if (src[k] === ']') { depth--; if (!depth) { end = k; break; } }
    }
    if (end < 0) return null;
    var body = src.slice(j + 1, end).replace(/\/\*[\s\S]*?\*\//g, '');
    var out = [];
    body.replace(/'([^']+)'/g, function (_, w) { out.push(w); return ''; });
    return out;
  }
  var seed = listFrom(fs.readFileSync(path.join(ROOT, 'scripts/seed-omega-orgs.js'), 'utf8'), 'STOREFRONT_KEYS');
  var page = listFrom(SETUP, 'SF_KEYS');
  ok('both allowlists were found', !!(seed && seed.length > 5) && !!(page && page.length > 5),
     { seed: seed && seed.length, page: page && page.length });
  if (seed && page) {
    var missing = seed.filter(function (k) { return page.indexOf(k) < 0; });
    var extra = page.filter(function (k) { return seed.indexOf(k) < 0; });
    ok('the setup page publishes every storefront key the seed script does', !missing.length, missing);
    ok('and invents none of its own', !extra.length, extra);
  }
})();

/* ── 7 · The committed catalogue ─────────────────────────────────────────
   whitelabel-setup.html loads tenants/<slug>/products.json, which is the
   IMPORTER's output — so the column mapping, the unit conversion and the
   footprint sanity check live in one place and the browser does none of it. */
(function () {
  var f = path.join(ROOT, 'tenants/cleancell/products.json');
  ok('a catalogue is committed for the demo', fs.existsSync(f));
  if (!fs.existsSync(f)) return;
  var list = JSON.parse(fs.readFileSync(f, 'utf8'));
  ok('it is an array of products', Array.isArray(list) && list.length > 0, list && list.length);
  ok('every product can be ordered', list.every(function (p) { return p.sku && (p.kw > 0 || p.kwh > 0); }));
  ok('every product can be DRAWN — no footprint means no site study',
     list.every(function (p) { return p.widthFt > 0 && p.depthFt > 0; }),
     list.filter(function (p) { return !(p.widthFt > 0 && p.depthFt > 0); }).map(function (p) { return p.sku; }));
  ok('every product states what the enclosure integrates',
     list.every(function (p) { return p.integrates && typeof p.integrates.pcs === 'boolean'; }));
  ok('no cost basis rode in on a product',
     list.every(function (p) {
       return p.capexPerKwh === undefined && p.capexPerKw === undefined
         && p.cost === undefined && p.margin === undefined && p.buyPrice === undefined;
     }));
  /* The importer's reporting flag is not the stored shape. */
  ok('the reporting flag was stripped',
     list.every(function (p) { return p._hasIntegrationAnswer === undefined; }));
  /* A placeholder spec must SAY it is one, in the field the setup page reads,
     or the warning never fires and a made-up footprint reaches a customer. */
  var ph = list.filter(function (p) { return /placeholder/i.test(String(p.notes || '')); });
  ok('placeholder specs declare themselves in notes', ph.length === list.length, ph.length + '/' + list.length);
  /* The footprint band the importer enforces, re-asserted on the artifact:
     a container is 20 or 40 ft, a cabinet is a few feet. */
  ok('every footprint is plausible for a battery',
     list.every(function (p) { return p.widthFt >= 0.5 && p.widthFt <= 80 && p.depthFt >= 0.5 && p.depthFt <= 80; }),
     list.map(function (p) { return p.sku + ':' + p.widthFt + 'x' + p.depthFt; }));
})();

/* ── Report ─────────────────────────────────────────────────────────────
   The async assertions above resolve on the microtask queue; the report runs
   after them. setTimeout rather than a promise chain so a thrown assertion in
   one block does not swallow the rest. */
setTimeout(function () {
  console.log('\nwhite-label staff preview: ' + pass + ' passed, ' + fail + ' failed');
  if (fail) process.exit(1);
}, 50);
