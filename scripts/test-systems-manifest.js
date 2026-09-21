#!/usr/bin/env node
/* scripts/test-systems-manifest.js — the tenant status feed
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   Two jobs. First: the manifest tells the truth about caps and holds, because
   an agent relays these sentences to a human who will act on them. Second,
   and the one that matters more: the tenant's COST BASIS never appears in it.
   The inputs below are deliberately poisoned with capexPerKwh and margin, and
   the whole serialised output is searched for them. */
'use strict';
var S = require('../api/_lib/systems.js');

var pass = 0, fail = 0;
function ok(name, cond, got) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (got === undefined ? '' : '  got: ' + JSON.stringify(got))); }
}
function find(m, key) {
  for (var i = 0; i < m.surfaces.length; i++) if (m.surfaces[i].key === key) return m.surfaces[i];
  return null;
}
var BASE = {
  orgId: 'CleanCell.US', name: 'Clean Cell', tier: 'deluxe',
  platformName: 'Clean Cell Power Platform', editorMode: 'bess-lite'
};
function mk(extra) {
  var i = {}; for (var k in BASE) i[k] = BASE[k];
  for (var j in (extra || {})) i[j] = extra[j];
  return S.buildManifest(i, '2026-09-20T10:00:00Z');
}

console.log('\ntenant systems manifest\n');

/* ── THE COST BASIS NEVER LEAVES ────────────────────────────────────────── */
var poisoned = mk({
  capexPerKwh: 312.5, capexPerKw: 640, cost: 191000, margin: 0.22,
  tenantPricing: { total: 240000 }, pricing: { total: 310000 },
  whiteLabel: { platformName: 'Clean Cell Power Platform', embed: { origins: ['x'] } },
  embedKeyActive: true, originCount: 1, origins: ['https://cleancell.us'],
  siteStudyOn: true, customers: 3, benches: 4, designerSeats: 1
});
var blob = JSON.stringify(poisoned);
['capexPerKwh', 'capexPerKw', '312.5', '640', 'margin', 'tenantPricing', '191000', '240000', '310000']
  .forEach(function (needle) {
    ok('the manifest never carries ' + needle, blob.indexOf(needle) < 0);
  });
ok('  and it is not simply empty', poisoned.surfaces.length === 6 && blob.length > 400);
ok('the whiteLabel block is not forwarded wholesale', blob.indexOf('"whiteLabel"') < 0);
ok('  though the platform name it paints with is kept',
   poisoned.platformName === 'Clean Cell Power Platform');

/* ── caps, which are the thing somebody has to act on ───────────────────── */
var atCap = mk({ embedKeyActive: true, originCount: 1, ordersToday: 60, dailyOrderCap: 60 });
ok('an order cap reached reports down', find(atCap, 'storefront').state === 'down');
ok('  and says orders are being refused', /refused/.test(find(atCap, 'storefront').say));
var near = mk({ embedKeyActive: true, originCount: 1, ordersToday: 50, dailyOrderCap: 60 });
ok('83% of the cap reports warn', find(near, 'storefront').state === 'warn', find(near, 'storefront'));
var easy = mk({ embedKeyActive: true, originCount: 2, ordersToday: 3, dailyOrderCap: 60 });
ok('3 of 60 reports ok', find(easy, 'storefront').state === 'ok');
ok('  and counts the origins in words', /2 allowed origins/.test(find(easy, 'storefront').say));
ok('no cap set never divides by zero', S.capState(9, 0).pct === null && S.capState(9, 0).state === 'ok');

/* ── off is not down ────────────────────────────────────────────────────── */
var bare = mk({});
ok('a tenant with no embed key reports OFF, not down', find(bare, 'storefront').state === 'off');
ok('a tenant with no benches reports OFF, not down', find(bare, 'plant').state === 'off');
ok('a tenant with no customers reports OFF, not down', find(bare, 'portal').state === 'off');
ok('a tenant with no designer seats reports OFF', find(bare, 'designer').state === 'off');
ok('  so a tenant who bought nothing is not an incident', bare.overall === 'ok', bare.overall);
ok('  and liveSurfaces counts only what is switched on', bare.liveSurfaces === 1, bare.liveSurfaces);

/* ── the floor ──────────────────────────────────────────────────────────── */
var held = mk({ benches: 10, benchesActive: 9, unitsInFlight: 14, unitsOnHold: 2 });
ok('a unit on hold raises the floor to warn', find(held, 'plant').state === 'warn');
ok('  and says how many, in words', /2 units on hold/.test(find(held, 'plant').say), find(held, 'plant').say);
var flowing = mk({ benches: 10, benchesActive: 10, unitsInFlight: 1, unitsOnHold: 0 });
ok('one unit moving is singular', /1 unit moving/.test(find(flowing, 'plant').say), find(flowing, 'plant').say);

/* ── the order desk ─────────────────────────────────────────────────────── */
var waiting = mk({ ordersNew: 1 });
ok('a new order raises the desk to warn', find(waiting, 'orders').state === 'warn');
ok('  singular reads correctly', /1 new order waiting/.test(find(waiting, 'orders').say), find(waiting, 'orders').say);
var clear = mk({ ordersNew: 0, ordersConfirmed: 2 });
ok('nothing new reads as nothing waiting', /Nothing waiting/.test(find(clear, 'orders').say));

/* ── overall is the worst live surface ──────────────────────────────────── */
var mixed = mk({ embedKeyActive: true, originCount: 1, ordersToday: 60, dailyOrderCap: 60,
                 benches: 3, unitsOnHold: 0, customers: 1 });
ok('overall takes the worst live state', mixed.overall === 'down', mixed.overall);
var warnOnly = mk({ benches: 3, unitsOnHold: 1, customers: 1 });
ok('a warn with no down is warn', warnOnly.overall === 'warn', warnOnly.overall);

/* ── shape and hygiene ──────────────────────────────────────────────────── */
ok('orgId is lower-cased the way the rules fold it', bare.orgId === 'cleancell.us', bare.orgId);
ok('every surface carries key, label, state and say',
   bare.surfaces.every(function (s) { return s.key && s.label && s.state && typeof s.say === 'string'; }));
ok('every state is one of the four words',
   bare.surfaces.every(function (s) { return ['ok', 'warn', 'down', 'off'].indexOf(s.state) >= 0; }));
ok('no surface reports a colour instead of a word',
   blob.indexOf('"green"') < 0 && blob.indexOf('"red"') < 0 && blob.indexOf('"amber"') < 0);
ok('a missing editorMode reports the full platform', mk({ editorMode: null }).editorMode === 'full');
ok('the designer names which product it is running',
   /BESS designer/.test(find(mk({ designerSeats: 2 }), 'designer').say));
ok('garbage input does not throw', (function () {
  try { S.buildManifest(null, null); S.buildManifest({ ordersToday: 'x', dailyOrderCap: -4 }, 'x'); return true; }
  catch (e) { return false; }
})());

console.log('\n  ' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
