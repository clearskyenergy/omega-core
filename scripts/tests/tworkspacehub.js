/* The hub names only tools and modules that exist, and composes honestly.
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   omega-workspace-hub.js decides which six areas ring Today on the Omega
   Workspace home. An area is a list of tool keys; a Logic area names a
   module. Both lists are typed by hand, so this asserts every key against
   the REAL catalogs (OMEGATools.catalog(), api/_lib/modules.js) — a tool
   renamed or retired cannot leave a dead cell — and pins the composition
   rules: Today is the centre, Projects and Team are always in the ring,
   an area with nothing open earns no cell, a packaged Lite workspace gets
   exactly Lite's areas, and a workspace holding Omega Logic leads with it.

   node scripts/tests/tworkspacehub.js */
'use strict';
var path = require('path'), ROOT = path.join(__dirname, '..', '..');
var HUB = require(path.join(ROOT, 'omega-workspace-hub.js'));
var TOOLS = require(path.join(ROOT, 'omega-tools.js'));
var M = require(path.join(ROOT, 'api', '_lib', 'modules.js'));
var pass = 0, fail = 0;
function ok(m, c, got) { if (c) { pass++; return; } fail++; console.log('  FAIL ' + m + (got !== undefined ? '  got: ' + JSON.stringify(got) : '')); }

var catalog = TOOLS.catalog(), keys = catalog.map(function (t) { return t.key; });
var moduleKeys = M.catalog().map(function (m) { return m.key; });

/* 1 · every key the table names exists */
HUB.AREAS.forEach(function (a) {
  (a.tools || []).forEach(function (k) { ok('area ' + a.key + ' names a real tool: ' + k, keys.indexOf(k) >= 0); });
  if (a.logic) ok('area ' + a.key + ' names a real module: ' + a.logic, moduleKeys.indexOf(a.logic) >= 0);
  ok('area ' + a.key + ' has a label, an icon and a hint', !!(a.label && a.icon && a.hint));
});
/* every sold, live tool belongs to some area, so nothing bought is unreachable from the hub */
var placed = {}; HUB.AREAS.forEach(function (a) { (a.tools || []).forEach(function (k) { placed[k] = true; }); });
catalog.forEach(function (t) { if (t.soon || t.key === 'intake_admin') return; ok('tool ' + t.key + ' belongs to an area', !!placed[t.key]); });

/* 2 · composition */
function ctxFor(ws, extra) {
  var c = { canOpen: function (k) { var t = TOOLS.byKey(k); return !!t && TOOLS.isUnlocked(t, ws); }, tool: function (k) { return TOOLS.byKey(k); }, modules: ws.modules || [], addons: ws.addons || [], hideMarketplace: !!ws.hideMarketplace };
  Object.keys(extra || {}).forEach(function (k) { c[k] = extra[k]; });
  return c;
}
var ent = HUB.compose(ctxFor({ orgId: 'x', tierLevel: 3 }));
ok('the centre is Today', ent.centre && ent.centre.key === 'today', ent.centre);
ok('the ring holds six', ent.ring.length === 6, ent.ring.map(function (a) { return a.key; }));
ok('Projects leads the ring and Team closes it', ent.ring[0].key === 'projects' && ent.ring[5].key === 'team', ent.ring.map(function (a) { return a.key; }));
ok('an enterprise workspace fills the middle with Design, Grid, Money, Sales', ent.ring.slice(1, 5).map(function (a) { return a.key; }).join() === 'design,grid,money,sales', ent.ring.map(function (a) { return a.key; }));

var none = HUB.compose(ctxFor({ orgId: 'x', toolAccess: [] }));
ok('an empty allowlist leaves only the always-on cells (Projects, Market, Team)', none.ring.map(function (a) { return a.key; }).join() === 'projects,market,team', none.ring.map(function (a) { return a.key; }));
var noMarket = HUB.compose(ctxFor({ orgId: 'x', toolAccess: [], hideMarketplace: true }));
ok('hideMarketplace drops Market when none of its tools are open', noMarket.ring.map(function (a) { return a.key; }).join() === 'projects,team', noMarket.ring.map(function (a) { return a.key; }));

var two = HUB.compose(ctxFor({ orgId: 'x', toolAccess: ['editor', 'gridatlas'] }));
ok('the two-tool product earns Design and Grid and nothing else of the tools', two.ring.map(function (a) { return a.key; }).join() === 'projects,design,grid,market,team', two.ring.map(function (a) { return a.key; }));

var liteTools = M.get('lite').tools.slice();
var lite = HUB.compose(ctxFor({ orgId: 'x', packaged: true, packageAccess: { packaged: true, toolAccess: liteTools, modules: ['lite'] }, modules: ['lite'] }));
ok('a packaged Lite workspace opens Design, Sales, Market and Permits (intake) from Lite\'s tools alone', lite.ring.map(function (a) { return a.key; }).join() === 'projects,design,sales,market,permits,team', lite.ring.map(function (a) { return a.key; }));

var logic = HUB.compose(ctxFor({ orgId: 'x', tierLevel: 3, packaged: false, modules: ['lite', 'logic-office', 'logic-plant', 'logic-logistics'] }));
ok('a workspace holding Omega Logic leads with Orders, Plant and Deliver', logic.ring.map(function (a) { return a.key; }).slice(0, 4).join() === 'projects,orders,plant,deliver', logic.ring.map(function (a) { return a.key; }));
var legacyLogic = HUB.compose(ctxFor({ orgId: 'x', tierLevel: 3, addons: ['omega-logic'] }));
ok('the legacy omega-logic add-on holds every part', legacyLogic.ring.map(function (a) { return a.key; }).slice(1, 4).join() === 'orders,plant,deliver', legacyLogic.ring.map(function (a) { return a.key; }));
var officeOnly = HUB.compose(ctxFor({ orgId: 'x', tierLevel: 3, modules: ['lite', 'logic-office'] }));
ok('Office alone earns Orders and not Plant or Deliver', officeOnly.ring.some(function (a) { return a.key === 'orders'; }) && !officeOnly.ring.some(function (a) { return a.key === 'plant' || a.key === 'deliver'; }), officeOnly.ring.map(function (a) { return a.key; }));

/* 3 · the side panel */
var rows = HUB.items('money', ctxFor({ orgId: 'x', tierLevel: 1 }));
ok('Money lists the Standard sizers open and the Deluxe models locked, open first', rows.length > 3 && !rows[0].locked && rows.some(function (r) { return r.locked; }) && rows.filter(function (r) { return r.locked; }).every(function (r, i, arr) { return rows.indexOf(r) >= rows.length - arr.length; }), rows.map(function (r) { return r.key + (r.locked ? ':locked' : ''); }));
ok('a row carries the catalog\'s name', rows.every(function (r) { return r.name && TOOLS.byKey(r.key).name === r.name; }));
ok('Projects panel names In flight and its page', (function (r) { return r[0].href === '#flight' && r[1].href === '/projects.html'; })(HUB.items('projects', ctxFor({ orgId: 'x' }))));
ok('an unknown area is empty', HUB.items('nope', ctxFor({})).length === 0);

/* 4 · does a workspace hold a module: the one rule the Modules page and
   the marketplace store share */
var MODS = {}; M.catalog().forEach(function (m) { MODS[m.key] = m; });
var ent3 = ctxFor({ orgId: 'x', tierLevel: 3 }, { tierLevel: 3, packaged: false });
ok('Enterprise holds a module whose tools are all open', HUB.moduleState(MODS.storage, ent3) === 'held', HUB.moduleState(MODS.storage, ent3));
ok('Enterprise holds a capabilities-only module (plan sets)', HUB.moduleState(MODS.plansets, ent3) === 'held');
ok('Enterprise without the add-on does not hold Omega Logic', HUB.moduleState(MODS['logic-office'], ent3) === 'ask');
var entLogic = ctxFor({ orgId: 'x', tierLevel: 3, addons: ['omega-logic'] }, { tierLevel: 3, packaged: false });
ok('the omega-logic add-on holds every Logic part', ['logic-office', 'logic-plant', 'logic-customer'].every(function (k) { return HUB.moduleState(MODS[k], entLogic) === 'held'; }));
var std1 = ctxFor({ orgId: 'x', tierLevel: 1 }, { tierLevel: 1, packaged: false });
ok('Standard does not hold a capabilities-only module', HUB.moduleState(MODS.plansets, std1) === 'ask');
var stdStates = M.catalog().map(function (m) { return HUB.moduleState(m, std1); });
ok('Standard holds some modules, is partly on others and asks for the rest', stdStates.indexOf('held') >= 0 && stdStates.indexOf('ask') >= 0, stdStates);
var partly = M.catalog().filter(function (m) { return HUB.moduleState(m, std1) === 'part'; })[0];
if (partly) { var pt = HUB.moduleTools(partly, std1); ok('a partly held module counts its open tools honestly', pt.open > 0 && pt.open < pt.total, pt); }
var pk = ctxFor({ orgId: 'x', tierLevel: 1, modules: ['lite'], packaged: true, toolAccess: ['editor'] }, { packaged: true, modules: ['lite'] });
ok('a packaged workspace holds exactly what its projection lists', HUB.moduleState(MODS.lite, pk) === 'held' && HUB.moduleState(MODS.gridatlas, pk) === 'open');
ok('an unknown module is asked for', HUB.moduleState(null, ent3) === 'ask');
/* 5 · the Modules page says what Site Map does (2026-09-27): a legacy plan
   holds a module only when the editor's tier ladder grants its capabilities,
   judged by the SAME OmegaCaps the editor runs */
global.window = global; require(path.join(ROOT, 'omega-caps.js')); var CAPS = global.OmegaCaps;
function legacy(tier, level, addons) { CAPS.setAddons(addons || []); var c = ctxFor({ orgId: 'x', tierLevel: level, addons: addons || [] }, { tierLevel: level, packaged: false }); c.editorCan = function (cap) { return CAPS.editorCan(tier, cap); }; return c; }
var stdE = legacy('standard', 1), delE = legacy('deluxe', 2), entE = legacy('enterprise', 3), trialE = legacy('trial', 3);
ok('the editor governs its ladder words and nothing a package invented', CAPS.governs('export.plotplan') && CAPS.governs('compute') && CAPS.governs('schematic') && !CAPS.governs('storage') && !CAPS.governs('gridatlas') && !CAPS.governs('all'));
ok('Standard does not hold Compute: its tools open, but Site Map shows the compute tab only on Enterprise', HUB.moduleState(MODS.compute, stdE) === 'part', HUB.moduleState(MODS.compute, stdE));
ok('Deluxe holds Plan Sets: the editor prints plot plans, one-lines, schematics and risers on Deluxe', HUB.moduleState(MODS.plansets, delE) === 'held', HUB.moduleState(MODS.plansets, delE));
ok('Standard does not hold Plan Sets', HUB.moduleState(MODS.plansets, stdE) === 'ask', HUB.moduleState(MODS.plansets, stdE));
ok('a legacy trial holds no editor-capability module although every tool opens', HUB.moduleState(MODS.plansets, trialE) !== 'held' && HUB.moduleState(MODS.engineering, trialE) !== 'held', [HUB.moduleState(MODS.plansets, trialE), HUB.moduleState(MODS.engineering, trialE)]);
ok('Lite is held on every plan, the floor', ['standard', 'deluxe', 'enterprise', 'trial'].every(function (t, i) { return HUB.moduleState(MODS.lite, [stdE, delE, entE, trialE][i]) === 'held'; }));
ok('on Enterprise the editor takes nothing away: every module reads as its tools alone say', M.catalog().every(function (m) { return HUB.moduleState(m, entE) === HUB.moduleState(m, ent3); }), M.catalog().map(function (m) { return m.key + ':' + HUB.moduleState(m, entE) + '/' + HUB.moduleState(m, ent3); }));
ok('the engineering add-on widens what a Standard editor holds', HUB.moduleState(MODS.engineering, legacy('standard', 1, ['engineering'])) !== 'ask');
ok('the counts say how much of a module the editor grants', (function (e) { return e.total > 0 && e.open === 0; })(HUB.moduleEditor(MODS.plansets, stdE)));
CAPS.setAddons([]);

/* 5b · editorCtx: the ONE mirror of OmegaCaps.resolve every surface asks */
function viaCtx(billing, who, level) { var c = ctxFor({ orgId: (who && who.orgId) || 'x', tierLevel: level, addons: (billing && billing.addons) || [] }, { tierLevel: level, packaged: false }), e = HUB.editorCtx(CAPS, billing, who); Object.keys(e).forEach(function (k) { c[k] = e[k]; }); return c; }
var trialC = viaCtx({ tier: 'trial' }, { email: 'a@newco.example', orgId: 'newco.example' }, 3);
ok('editorCtx: a trial runs Site Map as trial and is not Enterprise for a module with nothing to count (White Label)', trialC.tier === 'trial' && trialC.ungated === false && HUB.moduleState(MODS.whitelabel, trialC) === 'ask', [trialC.tier, HUB.moduleState(MODS.whitelabel, trialC)]);
var entC = viaCtx({ tier: 'enterprise' }, { email: 'a@big.example', orgId: 'big.example' }, 3);
ok('editorCtx: Enterprise is ungated and holds White Label', entC.ungated === true && HUB.moduleState(MODS.whitelabel, entC) === 'held');
var capC = viaCtx({ tier: 'enterprise', capTier: 'standard' }, { email: 'a@big.example', orgId: 'big.example' }, 3);
ok('editorCtx: capTier scopes Site Map below the billed tier, as the editor does', capC.tier === 'standard' && HUB.moduleState(MODS.plansets, capC) === 'ask', capC.tier);
var intC = viaCtx(null, { email: 'ann@clearsky-usa.com', emailVerified: true, orgId: 'clearsky-usa.com' }, 3);
ok('editorCtx: a verified ClearSky address with no billing record runs internal, as OmegaCaps.resolve does', intC.tier === 'internal' && intC.ungated && HUB.moduleState(MODS.plansets, intC) === 'held', intC.tier);
var unv = viaCtx(null, { email: 'ann@clearsky-usa.com', emailVerified: false, orgId: 'clearsky-usa.com' }, 3);
ok('editorCtx: an unverified ClearSky address is not internal', unv.tier === 'trial', unv.tier);
var staffJudge = HUB.editorCtx(CAPS, { tier: 'deluxe' }, { orgId: 'northstar.example' });
ok('editorCtx: staff judging a tenant by orgId get the tenant\'s tier, never internal', staffJudge.tier === 'deluxe' && staffJudge.editorCan('export.plotplan') === true);
ok('editorCtx: without the library nothing is counted', HUB.editorCtx(null, {}, {}) === null);
CAPS.setAddons([]);

/* 6 · one card, one status, at most one action (2026-09-27: "the opt in
   and opt out stuff you need to make that make sense"). Every state the
   Modules page, the home row and Plan & billing show comes from
   moduleCard, in the contract's words. */
var PK = function (mods) { return ctxFor({ orgId: 'x', tierLevel: 1, modules: mods, packaged: true, toolAccess: ['editor'] }, { packaged: true, modules: mods }); };
var O = { planName: 'Standard', company: 'Northstar', price: '$250/month', admin: true };
function card(m, ctx, bl, sm, o) { var oo = {}; Object.keys(O).forEach(function (k) { oo[k] = O[k]; }); Object.keys(o || {}).forEach(function (k) { oo[k] = o[k]; }); return HUB.moduleCard(m, ctx, bl || {}, sm || null, oo); }
var c;
c = card(MODS.lite, stdE); ok('Lite is live, always included, with no action', c.state === 'included' && c.pill === 'Live · always included' && !c.action, c);
c = card(MODS.gridatlas, PK(['lite', 'gridatlas'])); ok('a packaged held module is Live and offers Opt out', c.state === 'live' && c.pill === 'Live' && c.action.kind === 'remove' && c.action.label === 'Opt out', c);
c = card(MODS.gridatlas, PK(['lite'])); ok('a packaged module not held offers Opt in with its price and the proration', c.state === 'available' && c.pill === 'Not on your plan' && c.action.kind === 'add' && c.action.label === 'Opt in' && c.priceLine === '$250/month' && /Prorated today/.test(c.note), c);
c = card(MODS.gridatlas, PK(['lite']), {}, { gate: { canApply: false, reason: 'Pay your current invoice first.' } }); ok('a closed purchase gate says why and disables Opt in', c.action.disabled === true && c.note === 'Pay your current invoice first.', c);
c = card(MODS.gridatlas, PK(['lite']), {}, { pending: [{ add: ['gridatlas'], display: '$200.00', paymentLink: 'https://qb/pay', expiresOn: '2026-10-20' }] });
ok('an open change invoice reads Waiting for payment, pays through QuickBooks and can be cancelled', c.state === 'awaiting' && c.pill === 'Waiting for payment' && c.action.kind === 'pay' && c.action.href === 'https://qb/pay' && c.secondary.label === 'Cancel request' && /pay by Oct 20/.test(c.note), c);
c = card(MODS.gridatlas, PK(['lite']), { subscription: { modules: ['lite', 'gridatlas'] }, paymentLink: 'https://qb/p' }); ok('bought but not on yet: Pay now, never Opt out and never "Paid"', c.state === 'bought' && c.pill === 'Bought · not on yet' && c.action.kind === 'pay' && !/Paid/.test(c.pill + c.note), c);
c = card(MODS.gridatlas, PK(['lite', 'gridatlas']), { removalRequests: [{ module: 'gridatlas', requestedAt: '2026-09-27T12:00:00Z' }] }, { nextReviewOn: '2026-12-20' });
ok('a queued packaged opt-out stays on and billed until the review, and can be cancelled', c.state === 'removing' && c.pill === 'Opting out' && c.held && /until your review on Dec 20/.test(c.note) && c.action.label === 'Cancel request', c);
c = card(MODS.plansets, delE, { optOuts: { plansets: { status: 'requested', requestedAt: '2026-09-27' } } }); ok('a legacy opt-out is with ClearSky and access is unchanged', c.state === 'removing' && /Requested Sep 27/.test(c.note) && /access is unchanged/.test(c.note) && c.action.kind === 'cancel', c);
c = card(MODS.plansets, delE); ok('a legacy held module reads Included in the plan and offers Opt out', c.state === 'live' && c.priceLine === 'Included in Standard' && c.action.kind === 'remove', c);
c = card(MODS.plansets, stdE, { optIns: { plansets: { status: 'requested', requestedAt: '2026-09-27', display: '$500/month' } } }); ok('a legacy opt-in is requested with its price and can be cancelled', c.state === 'requested' && c.pill === 'Opt-in requested' && /at \$500\/month/.test(c.note) && c.action.label === 'Cancel request', c);
c = card(MODS.plansets, stdE, { optIns: { plansets: { status: 'withdrawn' } } }); ok('a withdrawn opt-in is simply available again', c.state === 'available' && c.action.kind === 'add', c);
c = card(MODS.compute, stdE); ok('partly included: says how much, offers Opt in for the rest, never Opt out', c.state === 'part' && c.pill === 'Partly included' && c.action.kind === 'add' && /Site Map features/.test(c.note) && /adds the rest/.test(c.note), c);
c = card(MODS.plansets, stdE); ok('a legacy module not held is Opt in, priced from the list, joining the monthly bill through ClearSky', c.state === 'available' && /once ClearSky moves you to monthly billing/.test(c.note) && /\$250\/month/.test(c.note) && c.action.label === 'Opt in', c);
c = card(MODS.gridatlas, PK(['lite', 'gridatlas']), {}, null, { admin: false }); ok('a member sees the status and who changes it, and no button', c.pill === 'Live' && !c.action && /owner or administrator of Northstar/.test(c.adminLine), c);
c = card(MODS.gridatlas, PK(['lite']), { subscription: { modules: ['lite', 'gridatlas'] }, paymentLink: 'https://qb/p' }, null, { admin: false }); ok('a member may still pay an open invoice', c.action && c.action.kind === 'pay', c);
c = card(MODS.gridatlas, PK(['lite']), {}, null, { pendingApproval: true }); ok('a workspace awaiting approval opens nothing yet', !c.action && /Opens when ClearSky approves Northstar/.test(c.note), c);
/* review #9: a module ON the plan of a workspace awaiting approval offers
   no Opt out either (it would file a request, an audit row and a staff
   mail about a plan ClearSky has not approved) */
c = card(MODS.gridatlas, PK(['lite', 'gridatlas']), {}, null, { pendingApproval: true }); ok('awaiting approval: a packaged module on the plan reads Live and offers no Opt out', c.state === 'live' && !c.action && !c.secondary && /opens when ClearSky approves Northstar/.test(c.note), c);
c = card(MODS.plansets, delE, {}, null, { pendingApproval: true }); ok('awaiting approval: a legacy module on the plan offers no Opt out', c.state === 'live' && !c.action && !c.secondary, c);
ok('awaiting approval: no card on any plan carries an action', [stdE, delE, entE, trialE, PK(['lite']), PK(['lite', 'gridatlas', 'logic-office'])].every(function (cx) { return M.catalog().every(function (m) { var k = card(m, cx, { optIns: { plansets: { status: 'requested' } }, optOuts: { gridatlas: { status: 'requested' } } }, { pending: [{ add: ['storage'], paymentLink: 'https://qb/pay' }] }, { pendingApproval: true }); return !k.action && !k.secondary; }); }));
/* review #8: the money column is the bare price on every card; the words
   that say where a held module is billed are in the note (the column is
   nowrap beside the name, and "$1,500/month · in your monthly fee" ran
   past a phone's card edge) */
c = card(MODS.gridatlas, PK(['lite', 'gridatlas'])); ok('a packaged Live module\'s money column is the bare price, the note says it is in the monthly fee', c.priceLine === '$250/month' && /in your monthly fee/.test(c.note), c);
ok('every card\'s money column is short: a price or a few words, never price and words', [stdE, delE, entE, trialE, PK(['lite']), PK(['lite', 'gridatlas', 'estimate', 'engineering', 'siteintel', 'logic-office', 'storage'])].every(function (cx) { return M.catalog().every(function (m) { var k = card(m, cx, {}, null, { price: '$1,500/month' }); return String(k.priceLine).length <= 22 && !/·/.test(k.priceLine); }); }));
/* review #10: ONE precedence. The card carries the record its state rests
   on, and Plan & billing lists what is in flight from the cards; a request
   the plan already answered is never in flight */
c = card(MODS.plansets, stdE, { optIns: { plansets: { status: 'requested', requestedAt: '2026-09-27', display: '$500/month' } } }); ok('a requested opt-in carries its request as the card\'s record', c.state === 'requested' && c.record && c.record.display === '$500/month', c);
c = card(MODS.plansets, delE, { optOuts: { plansets: { status: 'requested', requestedAt: '2026-09-27' } } }); ok('a legacy opt-out carries its request as the card\'s record', c.state === 'removing' && c.record && c.record.requestedAt === '2026-09-27', c);
c = card(MODS.plansets, delE, { optIns: { plansets: { status: 'requested', requestedAt: '2026-09-01' } } }); ok('a stale opt-in (the plan now holds the module) is Live, with no record in flight', c.state === 'live' && !c.record && c.action.kind === 'remove', c);
c = card(MODS.plansets, stdE, { optOuts: { plansets: { status: 'requested', requestedAt: '2026-09-01' } } }); ok('a stale opt-out (the plan no longer holds the module) is simply on offer, with no record in flight', c.state === 'available' && !c.record && c.action.kind === 'add', c);
c = card(MODS.gridatlas, PK(['lite', 'gridatlas']), { removalRequests: [{ module: 'gridatlas', requestedAt: 5 }] }); ok('a queued packaged opt-out carries the removal as its record', c.state === 'removing' && c.record && c.record.requestedAt === 5, c);
c = card(MODS.gridatlas, PK(['lite']), {}, { pending: [{ add: ['gridatlas'], display: '$200', paymentLink: 'https://qb/pay' }] }); ok('a change invoice is the awaiting card\'s record', c.state === 'awaiting' && c.record && c.record.paymentLink === 'https://qb/pay', c);
c = card(MODS.gridatlas, PK(['lite', 'gridatlas']), {}, { removalRequests: [{ module: 'gridatlas', requestedAt: 7 }] }); ok('the summary\'s removals stand in where billing/current carries none', c.state === 'removing' && c.record.requestedAt === 7, c);
c = card(MODS.plansets, stdE, {}, { optIns: { plansets: { status: 'requested', requestedAt: '2026-09-27' } } }); ok('the summary\'s opt-ins stand in where billing/current carries none', c.state === 'requested', c);
c = card(MODS.gridatlas, PK(['lite']), {}, { subscription: ['lite', 'gridatlas'] }); ok('the summary\'s subscription stands in where billing/current carries none', c.state === 'bought', c);
c = card(MODS.plansets, stdE, { optIns: {} }, { optIns: { plansets: { status: 'requested' } } }); ok('billing/current\'s own answer wins over the summary\'s', c.state === 'available', c);
var everyState = [];
[stdE, delE, entE, trialE, PK(['lite']), PK(['lite', 'gridatlas', 'logic-office'])].forEach(function (cx) { M.catalog().forEach(function (m) { var k = card(m, cx); everyState.push(k);
  ok('card ' + m.key + ' never offers Opt out unless it is Live', !(k.action && k.action.kind === 'remove') || k.state === 'live', k);
  ok('card ' + m.key + ' uses the contract words', !/Subscribe|\bAsk\b|Keep module/.test(k.pill + ' ' + k.note + ' ' + (k.action ? k.action.label : '')), k); }); });
ok('the pills are the contract pills', everyState.every(function (k) { return ['Live', 'Live · always included', 'Opting out', 'Waiting for payment', 'Bought · not on yet', 'Opt-in requested', 'Partly included', 'Not on your plan'].indexOf(k.pill) >= 0; }));
ok('a calendar day is that day wherever the reader is', HUB.shortDay('2026-12-20') === 'Dec 20' && HUB.shortDay('2026-01-01') === 'Jan 1' && HUB.shortDay('') === '');

M.catalog().forEach(function (m) { ok('module ' + m.key + ' says what it is for, in one sentence, with no price in it', typeof m.blurb === 'string' && m.blurb.length > 40 && !/\$\d/.test(m.blurb), m.blurb); });

console.log('tworkspacehub: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
