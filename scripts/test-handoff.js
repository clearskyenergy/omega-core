#!/usr/bin/env node
/* Storefront → designer → order. The hand-off, end to end.
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   THE FUNNEL THIS PROTECTS:
     size it (storefront) → build it (white-labelled editor) → order it

   Three things break it silently:

   1 · THE EDITOR TAB SAYS "ClearSky OMEGA". The visitor arrived from the
       manufacturer's own website and has no account, so nothing in the
       signed-in tenant runtime can brand the page. If applyBrand() stops
       setting the white label, the white label is gone at exactly the moment
       a customer is looking hardest.

   2 · THE ONE-LINE IS WRONG. getWizSteps() skips the PCS, disconnect and
       transformer steps when the cabinet integrates them. Those flags reach
       the editor only through the hand-off. Lose them and the guided build
       draws an external PCS on an all-in-one cabinet — a drawing that would
       not be built, handed to the customer who trusted it most.

   3 · THE ORDER IS FOR THE WRONG QUANTITY. The customer came to the designer
       to CHANGE the system. Ordering the link's quantity after they doubled
       it is the bug currentQty() exists to stop.

   node scripts/test-handoff.js */
'use strict';
var fs = require('fs'), path = require('path');
var ROOT = path.join(__dirname, '..');

var pass = 0, fail = 0;
function ok(name, cond, got) {
  if (cond) { pass++; return; }
  fail++; console.error('  FAIL ' + name + (got !== undefined ? '  got: ' + JSON.stringify(got) : ''));
}

/* ── A window the module can live in ───────────────────────────────────── */
function freshWindow(search) {
  var els = {};
  function El(tag) { this.tag = tag; this.style = { setProperty: function () {} }; this.children = []; this.value = ''; }
  El.prototype.appendChild = function (c) { this.children.push(c); return c; };
  El.prototype.setAttribute = function (k, v) { this[k] = v; };
  El.prototype.remove = function () {};
  El.prototype.querySelectorAll = function () { return []; };
  var body = new El('body');
  var w = {
    location: { search: search || '', origin: 'https://cleancell.clearskyomega.com' },
    document: {
      readyState: 'complete', title: 'ClearSky OMEGA -- Site Map Designer Pro',
      body: body, documentElement: new El('html'),
      getElementById: function (id) { return els[id] || null; },
      createElement: function (t) { return new El(t); },
      querySelectorAll: function () { return []; },
      addEventListener: function () {}
    },
    setTimeout: function () {},
    CLEARSKY_CONFIG: {},
    _els: els, _El: El
  };
  w.window = w;
  return w;
}

function loadInto(w) {
  var src = fs.readFileSync(path.join(ROOT, 'omega-storefront-handoff.js'), 'utf8');
  var wl = fs.readFileSync(path.join(ROOT, 'omega-whitelabel.js'), 'utf8');
  /* omega-whitelabel first — the hand-off calls OmegaWhiteLabel.apply(). */
  new Function('window', 'document', 'fetch', 'setTimeout', 'module',
    'var self=window;' + wl + '\n' + src)
    (w, w.document, w.fetch || function () { return Promise.reject(new Error('no fetch')); },
     w.setTimeout, { exports: {} });
  return w.OmegaStorefrontHandoff;
}

/* ── 1 · Reading the link ──────────────────────────────────────────────── */
var KEY = 'omega_pk_live_' + 'a'.repeat(32);
(function params() {
  var H = loadInto(freshWindow('?k=' + KEY + '&sku=CC-2000&qty=4&addr=4200+W+Industrial+Dr'));
  var p = H.readParams();
  ok('a well-formed hand-off link parses', !!p);
  ok('the sku carries', p.sku === 'CC-2000', p.sku);
  ok('the quantity carries', p.qty === 4, p.qty);
  ok('the address is decoded, plus signs and all', p.addr === '4200 W Industrial Dr', p.addr);

  ok('no key means no hand-off',
     loadInto(freshWindow('?sku=CC-2000')).readParams() === null);
  ok('no sku means no hand-off',
     loadInto(freshWindow('?k=' + KEY)).readParams() === null);
  ok('a malformed key is refused',
     loadInto(freshWindow('?k=sk_live_deadbeef&sku=X')).readParams() === null);
  ok('a path-traversing key is refused',
     loadInto(freshWindow('?k=omega_pk_live_a%2F..%2Fadmin&sku=X')).readParams() === null);
  ok('an absurd quantity is clamped',
     loadInto(freshWindow('?k=' + KEY + '&sku=X&qty=99999')).readParams().qty === 999);
  ok('a zero quantity becomes one',
     loadInto(freshWindow('?k=' + KEY + '&sku=X&qty=0')).readParams().qty === 1);
  ok('a nonsense quantity becomes one',
     loadInto(freshWindow('?k=' + KEY + '&sku=X&qty=abc')).readParams().qty === 1);
  ok('a plain editor URL is inert', loadInto(freshWindow('')).readParams() === null);
})();

/* ── 2 · The brand reaches the chrome ──────────────────────────────────── */
(function brand() {
  var w = freshWindow('?k=' + KEY + '&sku=CC-2000');
  var H = loadInto(w);
  H.applyBrand({}, {
    orgId: 'cleancell.us',
    name: 'Clean Cell', platformName: 'Clean Cell Power Platform',
    shortName: 'Clean Cell', logoUrl: '/x.png', accent: '#1F6F4A', attribution: ''
  });
  var t = w.CLEARSKY_CONFIG.tenant;
  ok('the tenant name is set', t.clientName === 'Clean Cell', t.clientName);
  ok('the logo is set', t.logo === '/x.png', t.logo);
  ok('the tenant key is set — without it the block never activates',
     t.orgId === 'cleancell.us', t.orgId);
  ok('a white-label block is created', !!t.whiteLabel && t.whiteLabel.enabled === true, t.whiteLabel);
  ok('the platform is renamed', t.whiteLabel.platformName === 'Clean Cell Power Platform');
  ok('the tab no longer says ClearSky OMEGA', !/ClearSky/i.test(w.document.title), w.document.title);
  ok('the tab says the tenant platform', /Clean Cell/.test(w.document.title), w.document.title);

  /* The editor's OWN brand resolver drives the EXPORTS. A chrome that says
     Clean Cell and a proposal that says "Your Company" is a half-done job. */
  ok('the editor export brand is fed too', w.CS_BRAND && w.CS_BRAND.companyName === 'Clean Cell', w.CS_BRAND);

  /* attribution is a contract term and travels WITH the brand. */
  var w2 = freshWindow('');
  var H2 = loadInto(w2);
  H2.applyBrand({}, { orgId: 'x.com', name: 'X', platformName: 'X Platform', attribution: 'Powered by ClearSky OMEGA' });
  ok('an attribution line is honoured when the contract carries one',
     w2.CLEARSKY_CONFIG.tenant.whiteLabel.attribution === 'powered-by',
     w2.CLEARSKY_CONFIG.tenant.whiteLabel);
  ok('and is off when it does not',
     w.CLEARSKY_CONFIG.tenant.whiteLabel.attribution === 'none');

  /* A tenant with no white-label block must not get a half-branded editor. */
  var w3 = freshWindow('');
  var H3 = loadInto(w3);
  H3.applyBrand({}, { orgId: 'plain.co', name: 'Plain Co' });
  ok('no platformName means no invented white label',
     !w3.CLEARSKY_CONFIG.tenant.whiteLabel, w3.CLEARSKY_CONFIG.tenant.whiteLabel);
  ok('but the company name still carries', w3.CLEARSKY_CONFIG.tenant.clientName === 'Plain Co');
})();

/* ── 3 · The system seeded into the designer ───────────────────────────── */
(function seed() {
  var w = freshWindow('?k=' + KEY + '&sku=CC-2000&qty=4');
  w.BESS_CATALOG = { 'GOTION-EDGE-760': { mfr: 'Gotion', kwh: 760 } };
  w.S = { bessList: [{ id: 'stale', name: 'Somebody else\'s battery', qty: '9' }] };
  var H = loadInto(w);

  var b = H.seedSystem({
    sku: 'CC-2000', name: 'CleanCell 2000 container', kw: 500, kwh: 2000,
    widthFt: 20, depthFt: 8, chemistry: 'LFP', brandName: 'Clean Cell',
    integrates: { pcs: true, xfmr: false, disco: true }
  }, 4);

  ok('a bess entry is produced', !!b);
  ok('the quantity is the one asked for', b.qty === '4', b.qty);
  ok('kW and kWh carry', b.kw === 500 && b.kwh === 2000, b);
  ok('the catalogue key is namespaced', /^SF-/.test(b.catalogKey), b.catalogKey);

  /* THE ONE THAT DECIDES THE DRAWING. */
  ok('integrates.pcs reaches the editor as _incPCS', b._incPCS === true);
  ok('integrates.disco reaches the editor as _incDisco', b._incDisco === true);
  ok('integrates.xfmr false stays false', b._incXfmr === false);

  ok('the product is registered in the catalogue', !!w.BESS_CATALOG[b.catalogKey]);
  ok('and the shipped entry is untouched', w.BESS_CATALOG['GOTION-EDGE-760'].mfr === 'Gotion');
  ok('the catalogue entry carries the footprint',
     w.BESS_CATALOG[b.catalogKey].widthFt === 20, w.BESS_CATALOG[b.catalogKey]);
  ok('the catalogue entry carries no price',
     !/price|cost/i.test(JSON.stringify(w.BESS_CATALOG[b.catalogKey])));

  /* A storefront link means THIS is the system. A leftover entry from a
     previous visit silently sizing the build is the failure. */
  ok('the stale bess list is REPLACED, not appended to', w.S.bessList.length === 1, w.S.bessList.length);
  ok('and the survivor is ours', w.S.bessList[0]._fromStorefront === true);

  /* An integrates-less product must not claim integration. */
  var b2 = H.seedSystem({ sku: 'X', name: 'X', kw: 10, kwh: 20 }, 1);
  ok('no integrates block means nothing is integrated',
     b2._incPCS === false && b2._incXfmr === false && b2._incDisco === false, b2);
})();

/* ── 4 · The order follows the DESIGN, not the link ────────────────────── */
(function quantity() {
  var w = freshWindow('?k=' + KEY + '&sku=CC-2000&qty=4');
  w.S = { bessList: [{ qty: '9' }] };
  var H = loadInto(w);
  H.mountOrderButton({ key: KEY, sku: 'CC-2000', qty: 4, product: { name: 'X' }, brand: 'Clean Cell' });
  ok('the quantity comes from what is CONFIGURED, not the link',
     H.currentQty() === 9, H.currentQty());

  w.S.bessList = [];
  ok('with nothing configured it falls back to the link', H.currentQty() === 4, H.currentQty());

  w.S.bessList = [{ qty: '99999' }];
  ok('and an absurd configured quantity is clamped', H.currentQty() === 999, H.currentQty());
})();

/* ── 5 · The wiring on both sides ──────────────────────────────────────── */
var ed = fs.readFileSync(path.join(ROOT, 'editor.html'), 'utf8');
/* The hand-off module stays: a link carrying a key and a SKU still
   pre-configures the designer for somebody who HAS an account — Clean Cell's
   rep sends it, or it rides the welcome email. What changed is that the
   public storefront no longer hands one out, and the gate decides. */
ok('editor.html still loads the hand-off for account holders',
   /src="\/omega-storefront-handoff\.js"/.test(ed));
ok('editor.html loads the white-label layer', /src="\/omega-whitelabel\.js"/.test(ed));
ok('editor.html loads omega-brand before it',
   ed.indexOf('/omega-brand.js') < ed.indexOf('/omega-whitelabel.js'));
ok('editor.html exposes BESS_CATALOG for the anonymous path',
   /window\.BESS_CATALOG = BESS_CATALOG/.test(ed));
ok('editor.html hydrates the white label', /OmegaWhiteLabel\.hydrate\(\)/.test(ed));
ok('the editor version chip is white-labelled', /data-omega-platform>ClearSky OMEGA<\/span> v/.test(ed));

/* ── THE STOREFRONT DOES NOT LET A STRANGER INTO THE EDITOR ────────────
   This is the correction. The storefront used to link straight into the
   designer, which put strangers inside the platform AND gave away the thing
   that is meant to be sold. The designer is now something a visitor ASKS
   FOR; omega-editor-gate.js is the door.

   Asserted as an ABSENCE, because an absence is what regresses quietly. */
var sf = fs.readFileSync(path.join(ROOT, 'embed', 'storefront.html'), 'utf8');
var sfCode = sf.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
ok('the storefront does NOT link into the editor', !/\/editor/.test(sfCode),
   (/.{0,60}\/editor.{0,60}/.exec(sfCode) || [])[0]);
ok('and opens no new tab at all', !/window\.open/.test(sfCode));
ok('it pitches the designer instead', /id="designBtn"/.test(sf));
ok('the pitch files a lead marked as a platform interest',
   /interest: 'platform'/.test(sfCode));
ok('through the SAME order endpoint as a product lead',
   /api\/embed-order/.test(sfCode));
ok('and is switchable per tenant', /CFG\.flow\.designerPitch/.test(sfCode));

var cfgSrc = fs.readFileSync(path.join(ROOT, 'api', 'embed-config.js'), 'utf8');
ok('embed-config exposes the pitch flag', /designerPitch: sf\.designerPitch !== false/.test(cfgSrc));
ok('embed-config no longer advertises an editor hand-off', !/editorHandoff/.test(cfgSrc));
ok('embed-config still publishes the platform name for a branded refusal',
   /platformName:/.test(cfgSrc));

/* ── THE LEAD SAYS WHICH KIND IT IS ────────────────────────────────────── */
var eo = fs.readFileSync(path.join(ROOT, 'api', 'embed-order.js'), 'utf8');
ok('embed-order records the interest', /interest:\s+\(b\.interest === 'platform'\)/.test(eo));
ok('and defaults to a product lead', /: 'product'/.test(eo));
ok('and the fulfilment email says which kind', /DESIGNER ACCOUNT enquiry/.test(eo));
var od = fs.readFileSync(path.join(ROOT, 'orders.html'), 'utf8');
ok('the order desk shows the kind', /Designer account/.test(od));
ok('and can filter to one kind', /id="fKind"/.test(od));

/* ── THE EDITOR GATE ───────────────────────────────────────────────────
   The whole point of the correction: no account, no designer. */
var gate = fs.readFileSync(path.join(ROOT, 'omega-editor-gate.js'), 'utf8');
ok('editor.html loads the gate', /src="\/omega-editor-gate\.js"/.test(ed));
ok('the gate loads BEFORE the editor body scripts',
   ed.indexOf('/omega-editor-gate.js') < ed.indexOf('/omega-bess-products.js'));
ok('and it does not claim to be the security boundary',
   /IT IS NOT THE SECURITY BOUNDARY/.test(gate));

/* ── THE GATE, ACTUALLY RUN ────────────────────────────────────────────
   Pattern-matching a refusal proves nothing about who gets in. Every account
   state is put through decide() against a stub Firestore, and the assertion
   is whether the curtain came DOWN. */
function runGate(docs, user) {
  var els = {};
  function El(t) { this.tag = t; this.style = {}; this.children = []; }
  El.prototype.appendChild = function (c) { this.children.push(c); els[c.id] = c; return c; };
  El.prototype.setAttribute = function (k, v) { this[k] = v; };
  El.prototype.removeChild = function (c) {
    var i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1);
    delete els[c.id];
  };
  var body = new El('body'); body.id = 'body';
  var w = {
    location: { href: '', pathname: '/editor', search: '' },
    document: {
      body: body, documentElement: new El('html'),
      getElementById: function (id) { return els[id] || null; },
      createElement: function (t) { var e = new El(t); e.parentNode = body; return e; },
      addEventListener: function () {}
    },
    setTimeout: function () {},
    firebase: {
      apps: [1],
      auth: function () { return { currentUser: user, onAuthStateChanged: function () {} }; },
      firestore: function () {
        return { collection: function (c) {
          return { doc: function (d) {
            var key = c + '/' + d;
            return {
              get: function () { return Promise.resolve({ exists: !!docs[key], data: function () { return docs[key]; } }); },
              collection: function (c2) { return { doc: function (d2) {
                var k2 = key + '/' + c2 + '/' + d2;
                return { get: function () { return Promise.resolve({ exists: !!docs[k2], data: function () { return docs[k2]; } }); } };
              } }; }
            };
          } };
        } };
      }
    }
  };
  w.window = w;
  new Function('window', 'document', 'setTimeout', 'module',
    'var self=window;' + gate)(w, w.document, w.setTimeout, { exports: {} });
  return w.OmegaEditorGate.decide(user).then(function () {
    return { allowed: !els['omega-editor-gate'], access: w.OMEGA_EDITOR_ACCESS,
             html: els['omega-editor-gate'] ? els['omega-editor-gate'].innerHTML : '' };
  });
}

var ORG = 'northgatefoods.com';
var USER = { email: 'dana@' + ORG };

Promise.resolve()
  /* THE TRAP: firestore.rules' tenantActive() says "ABSENT COUNTS AS ACTIVE
     ... a helper that failed closed on a missing doc would lock out all seven
     customers". Getting this backwards locks out every paying customer on the
     first deploy. */
  .then(function () { return runGate({}, USER); })
  .then(function (r) {
    ok('a signed-in user whose org has NO record gets in (absent = active)',
       r.allowed === true, r.access);
  })
  .then(function () {
    return runGate({ ['omega_orgs/' + ORG]: { status: 'active' } }, USER);
  })
  .then(function (r) { ok('an active workspace gets in', r.allowed === true, r.access); })

  .then(function () {
    return runGate({ ['omega_orgs/' + ORG]: { status: 'pending' } }, USER);
  })
  .then(function (r) {
    ok('a PENDING workspace is refused', r.allowed === false);
    ok('and is told it is being set up, not "denied"', /being set up/i.test(r.html), r.html.slice(0, 120));
  })

  .then(function () {
    return runGate({ ['omega_orgs/' + ORG]: { status: 'suspended' } }, USER);
  })
  .then(function (r) { ok('a SUSPENDED workspace is refused', r.allowed === false); })

  .then(function () {
    return runGate({ ['omega_orgs/' + ORG]: { status: 'cancelled' } }, USER);
  })
  .then(function (r) { ok('a CANCELLED workspace is refused', r.allowed === false); })

  .then(function () {
    return runGate({
      ['omega_orgs/' + ORG]: { status: 'active' },
      ['omega_orgs/' + ORG + '/billing/current']: { tier: 'standard', toolOverrides: { editor: false } }
    }, USER);
  })
  .then(function (r) {
    ok('an EXPLICIT editor switch-off is refused', r.allowed === false);
    ok('and is told it is a plan matter', /not on this plan/i.test(r.html), r.html.slice(0, 120));
  })

  .then(function () {
    return runGate({
      ['omega_orgs/' + ORG]: { status: 'active' },
      ['omega_orgs/' + ORG + '/billing/current']: { tier: 'trial' }
    }, USER);
  })
  .then(function (r) { ok('a trial workspace gets in — a trial is the product', r.allowed === true); })

  .then(function () {
    /* A seeded org with billing that names no tier at all is still a tenant
       somebody approved. Refusing here would be the absent-record trap
       wearing a different hat. */
    return runGate({
      ['omega_orgs/' + ORG]: { status: 'active' },
      ['omega_orgs/' + ORG + '/billing/current']: {}
    }, USER);
  })
  .then(function (r) { ok('billing with no tier does not lock anybody out', r.allowed === true); })

  .then(function () {
    return runGate({ 'omega_orgs/csebuilders.com': { status: 'suspended' } },
                   { email: 'tommy@csebuilders.com' });
  })
  .then(function (r) {
    ok('ClearSky staff pass even against a suspended record', r.allowed === true, r.access);
    ok('and are marked as staff', r.access && r.access.staff === true, r.access);
  })

  .then(function () { return runGate({}, { email: '' }); })
  .then(function (r) { ok('a user with no email address is refused', r.allowed === false); })

  .then(finishGate)['catch'](function (e) { ok('the gate suite ran', false, e.message); finishGate(); });

function finishGate() {

/* THE TRAP. firestore.rules' tenantActive() says "ABSENT COUNTS AS ACTIVE ...
   a helper that failed closed on a missing doc would lock out all seven
   customers". The same trap is in this gate and getting it backwards locks
   out every paying customer on the first deploy. */
ok('a MISSING org record fails OPEN, as the rules do',
   /if \(!exists\) return allow\(/.test(gate), 'missing-record path');
ok('and a failed read fails open too',
   /reason: 'read-failed'/.test(gate));
ok('only an EXPLICIT override refuses on entitlement',
   /ov\.editor === false/.test(gate));
ok('the gate paints BEFORE auth answers, not after',
   gate.indexOf('function start()') > 0 && /shield\(\);\s*\n\s*var began/.test(gate));
ok('and it does not claim to be the security boundary',
   /IT IS NOT THE SECURITY BOUNDARY/.test(gate));
ok('the refusal is branded, not a bare denial', /function brand\(\)/.test(gate));
ok('and offers a way to ask for an account', /Ask about an account/.test(gate));

/* ── 6 · The tenant's own order path ───────────────────────────────────── */
var ord = fs.readFileSync(path.join(ROOT, 'api', 'orders.js'), 'utf8');
ok('orders.js can create an order', /b\.action === 'create'/.test(ord));
ok('and pins the status, like the public path', /status: 'new',\s*\/\* pinned/.test(ord));
ok('and starts pricing at null', /pricing: null,\s*\/\* ClearSky prices it/.test(ord));
/* Scoped to create(). action:'price' reads b.pricing ON PURPOSE — that is
   the staff-only endpoint for putting a price on an order, and asserting its
   absence across the whole file was the test misunderstanding the code. */
var createBody = ord.slice(ord.indexOf('function create(caller, b)'));
ok('create() never takes an item price from the request',
   !/listPrice:\s*num\(it/.test(createBody), createBody.match(/listPrice:[^,]*/));
ok('create() reads the item price from the catalogue instead',
   /listPrice: \(p && p\.priceMode === 'list'\) \? num\(p\.listPrice\) : null/.test(createBody));
ok('create() never takes pricing wholesale from the request',
   !/pricing:\s*b\.pricing/.test(createBody));
ok('create() never lets the request choose the status',
   !/status:\s*clean\(b\.status/.test(createBody) && !/b\.status/.test(createBody));
ok('create() never lets the request choose who fulfils',
   !/b\.fulfilledBy/.test(createBody));
ok('and stamps who placed it', /placedBy: caller\.email/.test(ord));
ok('and refuses a project belonging to another workspace',
   /that project belongs to another workspace/.test(ord));

console.log('\nstorefront hand-off: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
}
