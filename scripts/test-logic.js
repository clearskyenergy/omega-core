#!/usr/bin/env node
/* scripts/test-logic.js — the Omega Logic roll-up
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   Three things this has to get right, and all three are ways of reporting
   something that is not true:

     1. A stage that does not exist must read as ABSENT, not as zero. The
        first collected-cash number in the estate is the one people will
        believe, so a `deposit: true` left over from the demo must not become
        money and an unshipped order must not become a shipment record.
     2. A floor we could not READ must not look like a floor with nothing on
        it. Those are the same board and opposite facts.
     3. The milestone must stay the portal's, so the word staff read and the
        word the customer reads cannot drift. */
'use strict';
var L = require('../api/_lib/logic.js');
var Q = require('../api/_lib/portal.js');
var P = require('../api/_lib/plant.js');

var pass = 0, fail = 0;
function ok(name, cond, got) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (got === undefined ? '' : '  got: ' + JSON.stringify(got))); }
}

console.log('\nomega logic roll-up\n');

function order(over) {
  var o = {
    orderNo: 'CC-26-4419', orgId: 'CleanCell.US', orgName: 'Clean Cell',
    status: 'in_fulfilment', createdAt: '2026-09-01T10:00:00Z',
    customer: { name: 'Dana Ruiz', company: 'Riverside Cold Chain',
                email: 'Ops@Riverside.example', phone: '312-555-0110',
                notes: 'shopping us against Tesla' },
    items: [{ sku: 'CC-418', name: '418 kWh cabinet', qty: 3 }],
    system: { kw: 600, kwh: 1254 },
    pricing: { total: 310000 }, cost: 191000, margin: 0.22,
    tenantPricing: { total: 336000, currency: 'USD' }
  };
  for (var k in (over || {})) o[k] = over[k];
  return o;
}
function units(spec) {
  return spec.map(function (s, i) {
    return { serial: 'CC418-26-' + (100 + i), at: s[0], hold: s[1] || null, ncr: s[2] || null };
  });
}
function floor(u, over) {
  var f = { units: u, known: true, released: true };
  for (var k in (over || {})) f[k] = over[k];
  return f;
}

/* ══ 1 · A STAGE THAT DOES NOT EXIST IS ABSENT, NOT ZERO ═════════════════ */
console.log('\n— what has not been built reports as absent —');

var m = L.moneyOf(order());
ok('no deposit record → depositPaidAt is null', m.depositPaidAt === null, m.depositPaidAt);
ok('  and it is NOT 0', m.depositPaidAt !== 0);
ok('  deposit is named in pending', m.pending.indexOf('deposit') >= 0, m.pending);
ok('  final is named in pending', m.pending.indexOf('final') >= 0, m.pending);
ok('  depositAmount is null, not 0', m.depositAmount === null, m.depositAmount);

var mBool = L.moneyOf(order({ deposit: true }));
ok('the demo\'s deposit:true is NOT money', mBool.depositPaidAt === null, mBool.depositPaidAt);
ok('  it still counts as pending', mBool.pending.indexOf('deposit') >= 0, mBool.pending);
ok('  and it is reported as the stand-in it is', mBool.legacyDepositFlag === true);

var mReal = L.moneyOf(order({ deposit: { paidAt: '2026-09-03T09:00:00Z', amount: 100800 } }));
ok('an object with a paid timestamp IS money', mReal.depositPaidAt === '2026-09-03T09:00:00Z', mReal.depositPaidAt);
ok('  it drops out of pending', mReal.pending.indexOf('deposit') < 0, mReal.pending);
ok('  legacy flag is false for a real record', mReal.legacyDepositFlag === false);
ok('  the amount comes through', mReal.depositAmount === 100800, mReal.depositAmount);

var sh = L.shipmentOf(order());
ok('no shipment → pending, and every field null',
  sh.pending === true && sh.carrier === null && sh.tracking === null && sh.shippedAt === null, sh);
var sh2 = L.shipmentOf(order({ shipment: { carrier: 'Estes', tracking: 'X9', bol: 'B1', shippedAt: '2026-11-02T00:00:00Z' } }));
ok('a real shipment is not pending', sh2.pending === false && sh2.carrier === 'Estes', sh2);

var rNone = L.rollup([order()], [floor([])], '2026-09-20T00:00:00Z');
ok('estate-wide collected is null, not 0', rNone.totals.collected === null, rNone.totals.collected);
function stageKeys(r, state) {
  return r.stages.filter(function (s) { return s.state === state; }).map(function (s) { return s.key; });
}
var offStages = stageKeys(rNone, 'off');
ok('implemented stages are not labelled unbuilt', offStages.length === 0, offStages);
/* A stage whose data is captured but never read back is neither. Calling
   unitdata `live` would promise a warranty surface that does not exist;
   calling it `off` would send somebody to rebuild a capture path that
   api/_lib/plant-release.js already validates. */
var partial = stageKeys(rNone, 'partial');
ok('accounting, release and shipment still disclose integration/setup requirements',
  partial.join(',') === 'payment,release,shipment,finalpay', partial);
ok('  intake, production and serial lookup have implemented read paths',
  stageKeys(rNone, 'live').join(',') === 'intake,production,unitdata', stageKeys(rNone, 'live'));
ok('  every stage carries the file that owns it',
  rNone.stages.every(function (s) { return s.by && s.label && s.key; }));

/* ══ 2 · AN UNREAD FLOOR IS NOT AN EMPTY FLOOR ═══════════════════════════ */
console.log('\n— an unread floor is not an idle floor —');

var known = L.row(order(), floor(units([['rack'], ['rack'], ['elec']])));
ok('a read floor is known', known.floor.known === true);
ok('  three units on the board', known.floor.board.total === 3, known.floor.board.total);

var unknown = L.row(order(), { units: [], known: false, released: true });
ok('an unread floor is flagged', unknown.floor.known === false);
ok('  its board is empty', unknown.floor.board.total === 0);
ok('  and it does NOT report a floor-derived milestone',
  unknown.milestone.key === Q.milestoneOf(order(), null).key, unknown.milestone.key);

var rMix = L.rollup(
  [order(), order({ orderNo: 'CC-26-4420' })],
  [floor(units([['rack']])), { units: [], known: false, released: true }],
  '2026-09-20T00:00:00Z');
ok('unknown floors are counted separately', rMix.totals.unknownFloors === 1, rMix.totals.unknownFloors);
ok('  and do not inflate the unit count', rMix.totals.units === 1, rMix.totals.units);

/* an order that cannot be on the floor is not joined at all */
ok("status 'new' needs no floor join", L.needsFloor(order({ status: 'new' })) === false);
ok("status 'quoted' needs no floor join", L.needsFloor(order({ status: 'quoted' })) === false);
ok("status 'cancelled' needs no floor join", L.needsFloor(order({ status: 'cancelled' })) === false);
ok("status 'in_fulfilment' DOES", L.needsFloor(order({ status: 'in_fulfilment' })) === true);
ok('an unrecognised status joins by default — slower, never wrong',
  L.needsFloor(order({ status: 'awaiting_dg_paperwork' })) === true);

/* ══ 3 · THE BOARD ADDS UP ═══════════════════════════════════════════════ */
console.log('\n— the board adds up —');

var b = L.board(units([['kit'], ['rack'], ['rack'], ['', null], ['elec', 'capacity test failed', 'NCR-12']]),
                P.DEFAULT_ROUTING);
var summed = b.columns.reduce(function (n, c) { return n + c.count; }, 0);
ok('columns + unstarted + off-routing = total',
  summed + b.unstarted + b.offRouting === b.total, { summed: summed, b: b });
ok('  the unstarted unit is not on a bench', b.unstarted === 1, b.unstarted);
ok('  two at Rack assembly', b.columns[P.indexOf(P.DEFAULT_ROUTING, 'rack')].count === 2);
ok('  one hold counted', b.held === 1, b.held);
ok('  and counted on its own column',
  b.columns[P.indexOf(P.DEFAULT_ROUTING, 'elec')].held === 1);

/* A station the routing does not know must not vanish from the total. */
var bOff = L.board(units([['rack'], ['paint_shop']]), P.DEFAULT_ROUTING);
ok('an off-routing station is counted, not dropped', bOff.offRouting === 1 && bOff.total === 2, bOff);
ok('  so the columns do not claim the whole floor',
  bOff.columns.reduce(function (n, c) { return n + c.count; }, 0) === 1);

/* ══ 4 · THE MILESTONE STAYS THE PORTAL'S ════════════════════════════════ */
console.log('\n— one ladder in the estate —');

[[['kit'], ['rack']], [['bms'], ['qa']], [['ready'], ['ready']], [['qa', 'failed']]].forEach(function (spec) {
  var u = units(spec);
  var o = order();
  var mine = L.row(o, floor(u)).milestone.key;
  var theirs = Q.milestoneOf(o, u).key;
  ok('milestone matches api/_lib/portal.js for ' + JSON.stringify(spec.map(function (s) { return s[0]; })),
    mine === theirs, { mine: mine, theirs: theirs });
});

var heldRow = L.row(order(), floor(units([['qa', 'capacity test failed', 'NCR-12'], ['ready']])));
ok('a held unit holds the order back', heldRow.milestone.key !== 'ready', heldRow.milestone.key);

/* ══ 5 · THE ROLL-UP ═════════════════════════════════════════════════════ */
console.log('\n— the roll-up —');

var r = L.rollup(
  [order(), order({ orderNo: 'CC-26-4420', orgId: 'fenecon.com', orgName: 'Fenecon', status: 'new' })],
  [floor(units([['rack'], ['qa', 'capacity test failed', 'NCR-12']])), floor([], { released: false })],
  '2026-09-20T00:00:00Z');

ok('two orders', r.totals.orders === 2, r.totals.orders);
ok('two units', r.totals.units === 2, r.totals.units);
ok('one held', r.totals.held === 1, r.totals.held);
ok('one hold row, carrying its NCR and its bench',
  r.holds.length === 1 && r.holds[0].ncr === 'NCR-12' && r.holds[0].station === 'QA / FAT', r.holds);
ok('two tenants, ordered by order count', r.tenants.length === 2 && r.tenants[0].orders >= r.tenants[1].orders, r.tenants);
ok('orgId is lowercased', r.orders[0].orgId === 'cleancell.us', r.orders[0].orgId);
ok('customer email is lowercased', r.orders[0].customer.email === 'ops@riverside.example', r.orders[0].customer.email);
ok('asOf is the one we passed in', r.asOf === '2026-09-20T00:00:00Z', r.asOf);
ok('stations always list all ten benches', r.stations.length === P.DEFAULT_ROUTING.length, r.stations.length);
ok('  including the empty ones', r.stations.filter(function (s) { return s.count === 0; }).length === 8);

/* The rep's own note is aliased into customer.notes at api/orders.js:258.
   This is a staff surface so it would be legitimate to show — but it is not
   named in the projection, and an unnamed field must not appear. */
var ser = JSON.stringify(r);
ok('nothing unnamed leaks: customer.notes absent', ser.indexOf('shopping us against Tesla') < 0);
ok('  margin absent (not named)', ser.indexOf('0.22') < 0);
ok('staff DO see cost and both prices — this is the one surface that may',
  r.orders[0].money.cost === 191000 && r.orders[0].money.clearskyTotal === 310000
  && r.orders[0].money.tenantTotal === 336000, r.orders[0].money);

/* Timestamps. Firestore hands back an object and String()-ing one yields
   "[object Object]" — the bug api/_lib/portal.js documents. */
var tsOrder = order({ createdAt: { toDate: function () { return new Date('2026-09-01T10:00:00Z'); } } });
var tsRow = L.row(tsOrder, floor([]));
ok('a Timestamp renders as ISO', tsRow.placedAt === '2026-09-01T10:00:00.000Z', tsRow.placedAt);
ok('  and "[object Object]" appears nowhere', JSON.stringify(tsRow).indexOf('[object') < 0);

/* Nothing should throw on the empty estate. */
var empty = L.rollup([], [], '2026-09-20T00:00:00Z');
ok('the empty estate rolls up', empty.totals.orders === 0 && empty.holds.length === 0
  && empty.stations.length === P.DEFAULT_ROUTING.length);

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
