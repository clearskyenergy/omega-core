/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
/* A manufacturer's own workspace (2026-10-16, Tommy, of Clean Cell):
   1. its people open the FULL editor — billing.editorLite is what it offers
      its customers, never a redirect for the workspace itself;
   2. its battery pickers offer its own products only, while BESS_CATALOG
      keeps every entry so a saved drawing still resolves. */
'use strict';
var fs = require('fs'), path = require('path');
var root = path.join(__dirname, '..', '..');
var pass = 0, fail = 0;
function ok(name, cond, got) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (got !== undefined ? '  (got ' + JSON.stringify(got) + ')' : '')); }
}

var gate = fs.readFileSync(path.join(root, 'omega-editor-gate.js'), 'utf8');
ok('the editor gate never sends a workspace to Editor Lite', !/location\.replace\(\s*'\/editor-lite/.test(gate));

global.window = global;
var CAT = {
  'GOTION-EDGE-760': { mfr: 'Gotion', model: 'Gotion EDGE 760', kw: 380, kwh: 760 },
  'CC-R60': { mfr: 'Clean Cell', model: 'CleanCell R60', kw: 60, kwh: 61.44 },
  'CLEANCELL-CC290-125-REV-H': { mfr: 'CleanCell US', model: 'CC290', kw: 125, kwh: 289.3 },
  'LIB-1': { mfr: 'Someone', model: 'Library unit', kw: 10, kwh: 20, org: true }
};
global.BESS_CATALOG = CAT;
function fakeFirebase(org) {
  return { apps: [1], firestore: function () { return { collection: function () { return { doc: function () { return {
    collection: function () { return { doc: function () { return { get: function () { return Promise.resolve({ exists: true, data: function () { return { products: [] }; } }); } }; } }; },
    get: function () { return Promise.resolve({ exists: true, data: function () { return org; } }); }
  }; } }; } }; } };
}
var P = require(path.join(root, 'omega-bess-products.js'));

ok('a white-labelled manufacturer is own-only', P.ownOnlyOf({ vertical: 'oem', whiteLabel: { enabled: true } }) === true);
ok('a manufacturer without a white label is not (FENECON, Joules)', P.ownOnlyOf({ vertical: 'oem' }) === false);
ok('an installer is not', P.ownOnlyOf({ vertical: 'installer', whiteLabel: { enabled: true } }) === false);
ok('the record may say all', P.ownOnlyOf({ vertical: 'oem', whiteLabel: { enabled: true }, bessCatalog: 'all' }) === false);
ok('the record may say own', P.ownOnlyOf({ vertical: 'developer', bessCatalog: 'own' }) === true);

global.CLEARSKY_CONFIG = { tenant: { orgId: 'cleancell.us' } };
global.firebase = fakeFirebase({ name: 'Clean Cell', slug: 'cleancell', vertical: 'oem', whiteLabel: { enabled: true, shortName: 'Clean Cell' } });
P._reset();
P.load().then(function (t) {
  ok('load reports own-only', t.ownOnly === true, t.ownOnly);
  ok('another maker is off the catalogue', P.offCatalog('GOTION-EDGE-760') === true);
  ok('Clean Cell is on it', P.offCatalog('CC-R60') === false);
  ok('CleanCell US (Rev H) is on it', P.offCatalog('CLEANCELL-CC290-125-REV-H') === false);
  ok('the workspace library is on it', P.offCatalog('LIB-1') === false);
  ok('nothing is deleted from BESS_CATALOG', !!CAT['GOTION-EDGE-760']);

  /* prune keeps the chosen option and Custom, drops the rest, drops an empty group */
  function El(tag, value) { this.tag = tag; this.value = value; this.children = []; this.parentNode = null; }
  El.prototype.appendChild = function (c) { c.parentNode = this; this.children.push(c); return c; };
  El.prototype.removeChild = function (c) { this.children.splice(this.children.indexOf(c), 1); c.parentNode = null; };
  function all(el, tag, out) { out = out || []; el.children.forEach(function (c) { if (c.tag === tag) out.push(c); all(c, tag, out); }); return out; }
  El.prototype.querySelectorAll = function (tag) { return all(this, tag); };
  El.prototype.querySelector = function (tag) { return all(this, tag)[0] || null; };
  var sel = new El('select'); sel.value = '';
  var g1 = sel.appendChild(new El('optgroup')); g1.appendChild(new El('option', 'GOTION-EDGE-760'));
  var g2 = sel.appendChild(new El('optgroup')); g2.appendChild(new El('option', 'CC-R60'));
  var g3 = sel.appendChild(new El('optgroup')); g3.appendChild(new El('option', 'CUSTOM'));
  P.prune(sel, CAT);
  var left = sel.querySelectorAll('option').map(function (o) { return o.value; });
  ok('prune leaves Clean Cell and Custom', left.join() === 'CC-R60,CUSTOM', left);
  ok('and drops the emptied group', sel.querySelectorAll('optgroup').length === 2);

  var sel2 = new El('select'); sel2.value = 'GOTION-EDGE-760';
  sel2.appendChild(new El('option', 'GOTION-EDGE-760')); sel2.appendChild(new El('option', 'CC-R60'));
  P.prune(sel2, CAT);
  ok('a saved design keeps its chosen unit', sel2.querySelectorAll('option').length === 2);

  /* no own unit in the catalogue (no library unit either): nothing is hidden */
  delete CAT['LIB-1'];
  P._reset();
  global.firebase = fakeFirebase({ name: 'Acme', slug: 'acme', vertical: 'oem', whiteLabel: { enabled: true } });
  global.CLEARSKY_CONFIG = { tenant: { orgId: 'acme.com' } };
  return P.load().then(function () {
    ok('an own-only workspace with no product of its own sees everything', P.offCatalog('GOTION-EDGE-760') === false);
  });
}).then(function () {
  var ed = fs.readFileSync(path.join(root, 'editor.html'), 'utf8');
  ok('the auto-sizer skips off-catalogue units', /p\.kw >= targetKW && !p\.evSkid && !_bessOff\(k\)/.test(ed));
  ok('the Guided Build skips them', /_bessOff\(k\)\) continue;/.test(ed));
  ok('the pad picker skips them', /g\.lf && g\.wf && !\(typeof _bessOff==='function' && _bessOff\(k\)\)/.test(ed));
  ok('the equipment picker skips them', /BESS_CATALOG\[it\.key\] && _bessOff\(it\.key\)/.test(ed));
  console.log('\nbess own-only: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}).catch(function (e) { console.error(e); process.exit(1); });
