/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   The master console's reading of a PACKAGED workspace (admin/admin-console.js):
   each packaging state has its own standing key so the pills, the filter and
   the broadcast list agree; a reconciliation under review never reads as
   overdue; the plan and module keys become the price book's words; the
   Client Inventory carries the book from /api/offerings, never a copy.
   Pulls the functions out of the console source, as tnewtenant.js does. */
'use strict';
var assert = require('node:assert/strict'), fs = require('fs'), path = require('path');
var SRC = fs.readFileSync(path.join(__dirname, '../../admin/admin-console.js'), 'utf8');
var HTML = fs.readFileSync(path.join(__dirname, '../../admin/index.html'), 'utf8');
function grab(name) {
  var needle = 'function ' + name + '(', i = SRC.indexOf(needle);
  if (i < 0) throw new Error('not found: ' + name);
  var k = SRC.indexOf('{', i), d = 0;
  for (;; k++) { if (SRC[k] === '{') d++; else if (SRC[k] === '}') { d--; if (!d) break; } }
  return SRC.slice(i, k + 1);
}
var STATE = { priceBook: null };
var fns = new Function('STATE', 'esc', [grab('_standing'), grab('_pkgPlanName'), grab('_pkgModules'), grab('_pkgModuleNames'), grab('_priceBookStrip'),
  'return { standing: _standing, plan: _pkgPlanName, modules: _pkgModules, names: _pkgModuleNames, strip: _priceBookStrip };'].join('\n'))(STATE, function (s) { return String(s == null ? '' : s); });
var n = 0; function ok(c, m) { assert.ok(c, m); n++; }
var DAY = 86400000, soon = new Date(Date.now() + 5 * DAY).toISOString().slice(0, 10), later = new Date(Date.now() + 40 * DAY).toISOString().slice(0, 10);
function pk(b) { return fns.standing(Object.assign({ packaged: true }, b), { status: 'active' }); }

ok(pk({ packagingState: 'paid', nextInvoiceOn: later }).key === 'current' && pk({ packagingState: 'paid', nextInvoiceOn: later }).label === 'Active', 'paid, invoice far off: current');
ok(pk({ packagingState: 'paid', nextInvoiceOn: soon }).key === 'duesoon' && pk({ packagingState: 'paid', nextInvoiceOn: soon }).chip === 'good', 'paid, invoice inside 14 days: due soon, still good');
ok(pk({ packagingState: 'awaiting_payment', amountDue: 2250 }).key === 'awaiting' && /first payment/i.test(pk({ packagingState: 'awaiting_payment' }).label), 'awaiting the first payment has its own key');
ok(pk({ packagingState: 'past_due_lite' }).key === 'overdue' && /Lite/.test(pk({ packagingState: 'past_due_lite' }).label), 'past due on Lite is overdue and says so');
ok(pk({ packagingState: 'unpaid' }).key === 'overdue', 'unpaid is overdue');
ok(pk({ packagingState: 'trial', trialEndsAt: Date.now() + 3 * DAY }).key === 'trialend', 'a trial is always ending (14 days at most)');
ok(pk({ packagingState: 'pending' }).key === 'pending' && fns.standing({ packaged: true, packagingState: 'pending' }, { status: 'pending' }).key === 'pending', 'a proposed package is pending, packaged or not');
ok(pk({ packagingState: 'paid', reconciliationRequired: true }).key === 'review' && /Active/.test(pk({ packagingState: 'paid', reconciliationRequired: true }).label), 'a reconciliation under review keeps Active in its label: access is unchanged');
ok(pk({ packagingState: 'awaiting_payment', reissueRequired: true }).key === 'overdue' && /voided/.test(pk({ packagingState: 'awaiting_payment', reissueRequired: true }).label), 'a voided first invoice is named');
ok(pk({ packagingState: 'something_new' }).key === 'unpriced', 'an unknown state is a package review, never current');
var legacy = fns.standing({ tier: 'enterprise', amountDue: 0 }, { status: 'active' }); ok(legacy.key === 'current', 'a legacy record keeps the legacy reading');

/* the pills, the filter and the broadcast use the same keys */
var pills = /var pills=\[([\s\S]*?)\];/.exec(SRC)[1];
['awaiting', 'overdue', 'duesoon', 'trialend', 'review', 'pending', 'unpriced', 'current'].forEach(function (k) { ok(pills.indexOf("['" + k + "'") >= 0, 'pill for ' + k); });

/* plan and module words come from the book; keys until it loads */
ok(fns.plan({ plan: 'field' }) === 'Field' && fns.plan({ plan: 'alacarte' }) === 'Lite + modules' && fns.plan({}) === 'Lite + modules', 'plan keys read as words before the book loads');
ok(fns.names(['lite', 'gridatlas']).join() === 'lite,gridatlas', 'module keys stay keys before the book loads');
STATE.priceBook = { pricebookVersion: '2026-10', source: 'seeded', lite: { monthlyDisplay: '$500/month' }, plans: [{ key: 'field', name: 'Field', monthlyDisplay: '$1,299/month' }, { key: 'pro', name: 'Pro', monthlyDisplay: '$2,499/month' }],
  enterprise: { annualFloorDisplay: '$150,000/year' }, logins: { builderDisplay: '$50/month', viewerDisplay: '$15/month' }, modules: [{ key: 'lite', name: 'Lite', monthlyDisplay: '$500/month' }, { key: 'gridatlas', name: 'Grid Atlas', monthlyDisplay: '$250/month' }] };
ok(fns.plan({ plan: 'pro' }) === 'Pro' && fns.names(['lite', 'gridatlas']).join(', ') === 'Lite, Grid Atlas', 'with the book loaded the words are the book\'s');
ok(fns.modules({ subscription: { modules: ['lite', 'gridatlas'] }, modules: ['lite'] }).join() === 'lite,gridatlas', 'the package is what was bought, not what is on');
ok(fns.modules({ proposedPackage: { modules: ['lite', 'storage'] } }).join() === 'lite,storage', 'a proposed package counts before activation');
var strip = fns.strip();
ok(/Price book 2026-10/.test(strip) && /Field<\/b> \$1,299\/month/.test(strip) && /Grid Atlas \$250\/month/.test(strip) && /Enterprise<\/b> from \$150,000\/year/.test(strip) && /legacy roster/.test(strip), 'the inventory strip prints the book, server-formatted');
ok(!/1299|2499|150000/.test(grab('_priceBookStrip')), 'and carries no price of its own');
ok(/fetch\('\/api\/offerings'/.test(grab('loadPriceBook')) && /loadPriceBook\(\);\n  loadTenants\(\);/.test(SRC), 'the book is fetched at boot, before the tenants');
ok(/id="cl-pricebook"/.test(HTML), 'Client Inventory has the strip');
ok(/Open the Package tab/.test(SRC) && /Move this workspace to a package/.test(SRC), 'a packaged workspace is sent to the Package tab; a legacy one may move');

/* ── The Package tab (admin/package-panel.js) reads a LEGACY tenant the way
   the tenant's own Modules page does (review finding 24): the tool levels
   omega-tenant.js gives the tier, and Site Map's half through
   OmegaWorkspaceHub.editorCtx(OmegaCaps, billing, { orgId }). Its "Holds"
   line and the activation preselection are built from that. Checked on the
   REAL tool catalog, module catalog, hub and capability ladder. */
var vm = require('vm'), ROOT = path.join(__dirname, '../..');
var PANEL = fs.readFileSync(path.join(ROOT, 'admin/package-panel.js'), 'utf8'), TENANT_HTML = fs.readFileSync(path.join(ROOT, 'admin/tenant.html'), 'utf8');
function grabFrom(src, name) {
  var needle = 'function ' + name + '(', i = src.indexOf(needle);
  if (i < 0) throw new Error('not found: ' + name);
  var k = src.indexOf('{', i), d = 0;
  for (;; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (!d) break; } }
  return src.slice(i, k + 1);
}
var capsBox = {}; capsBox.window = capsBox; vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'omega-caps.js'), 'utf8'), capsBox);
var TOOLS = require(path.join(ROOT, 'omega-tools.js')), HUB = require(path.join(ROOT, 'omega-workspace-hub.js')), MODS = require(path.join(ROOT, 'api/_lib/modules.js')).catalog();
var G = { OMEGATools: TOOLS, OmegaWorkspaceHub: HUB, OmegaCaps: capsBox.OmegaCaps };
var panelStanding = new Function('global', 'orgId', grabFrom(PANEL, 'dayOf') + '\n' + grabFrom(PANEL, 'standing') + '\nreturn standing;')(G, 'panel.example');
function legacyHolds(billing, org) { return panelStanding({ orgId: org || 'panel.example', billing: billing, modules: MODS }).held; }
/* what the tenant's Modules page shows as Live: workspace.html hubCtx() on omega-tenant.js's tier level */
var LEVEL = { trial: 3, standard: 1, pro: 2, deluxe: 2, enterprise: 3, internal: 3, partner: 2 };
function tenantHolds(billing, org) {
  var ws = { tierLevel: LEVEL[billing.tier] != null ? LEVEL[billing.tier] : 1, toolAccess: billing.toolAccess || null, toolOverrides: billing.toolOverrides || null };
  var c = { packaged: false, modules: [], addons: billing.addons || [], tierLevel: ws.tierLevel, tool: function (k) { return !!TOOLS.byKey(k); }, canOpen: function (k) { var t = TOOLS.byKey(k); return !!t && TOOLS.isUnlocked(t, ws); } };
  var e = HUB.editorCtx(capsBox.OmegaCaps, billing, { orgId: org || 'panel.example' }); c.editorCan = e.editorCan; c.ungated = e.ungated;
  return MODS.filter(function (m) { return HUB.moduleState(m, c) === 'held'; }).map(function (m) { return m.key; });
}
ok(legacyHolds({ tier: 'standard', addons: [] }).join() === 'lite,gridatlas,storage', 'Standard holds Lite, Grid Atlas and Storage; Compute is only partly on it, as its Modules page says: ' + legacyHolds({ tier: 'standard', addons: [] }).join());
var deluxe = legacyHolds({ tier: 'deluxe', addons: [] });
ok(deluxe.indexOf('plansets') >= 0 && deluxe.indexOf('siteintel') >= 0 && deluxe.indexOf('compute') < 0, 'Deluxe holds Plan Sets and Site Intelligence (Site Map grants them) and not Compute: ' + deluxe.join());
ok(legacyHolds({ tier: 'trial', addons: [] }).indexOf('whitelabel') < 0 && legacyHolds({ tier: 'enterprise', addons: [] }).indexOf('whitelabel') >= 0, 'a trial is not Enterprise for White Label; Enterprise holds it');
ok(legacyHolds({ tier: 'deluxe', capTier: 'standard', addons: [] }).indexOf('plansets') < 0, 'capTier scopes Site Map below the billed tier, as the editor does');
[{ tier: 'trial' }, { tier: 'standard' }, { tier: 'standard', addons: ['compute'] }, { tier: 'deluxe' }, { tier: 'deluxe', capTier: 'standard' }, { tier: 'enterprise' }, { tier: 'standard', toolAccess: ['editor', 'gridatlas'] }, { tier: 'deluxe', toolOverrides: { batterysizer: false } }].forEach(function (b) {
  b.addons = b.addons || [];
  ok(legacyHolds(b).join() === tenantHolds(b).join(), 'the Package tab holds what the tenant\'s Modules page shows as Live for ' + JSON.stringify(b) + ': ' + legacyHolds(b).join() + ' vs ' + tenantHolds(b).join());
});
var pre = panelStanding({ orgId: 'panel.example', modules: MODS, billing: { tier: 'standard', addons: [], optIns: { siteintel: { status: 'requested', name: 'Site Intelligence' } }, optOuts: { storage: { status: 'requested', name: 'Storage' } } } });
ok(pre.preselect.slice().sort().join() === 'gridatlas,lite,siteintel', 'the preselection is what it holds, plus the opt-in, less the opt-out: ' + pre.preselect.join());
var answeredStand = panelStanding({ orgId: 'panel.example', modules: MODS, billing: { tier: 'standard', addons: [], optOuts: { compute: { status: 'done', name: 'Compute & Data Center', resolvedAt: '2026-09-27', resolvedBy: 'staff@clearsky-usa.com' } } } });
ok(answeredStand.optingOut.length === 0 && answeredStand.lines.some(function (l) { return l === 'Answered: Compute & Data Center opt-out done 2026-09-27 by staff@clearsky-usa.com'; }), 'an answered request is no longer open, and the strip says who answered it');
var capsAt = TENANT_HTML.indexOf('<script src="/omega-caps.js"></script>'), panelAt = TENANT_HTML.indexOf('<script src="/admin/package-panel.js"></script>');
ok(capsAt > 0 && capsAt < panelAt && TENANT_HTML.indexOf('/omega-workspace-hub.js') < panelAt, 'admin/tenant.html loads the capability library and the hub before the panel');
ok(/'resolve-opt-in' : 'resolve-opt-out'/.test(grabFrom(PANEL, 'answer')) && /request\('\/api\/plan-change'/.test(grabFrom(PANEL, 'answer')), 'each open request is answered through plan-change, never a billing write from the page');
console.log('admin standing: ' + n + ' checks passed.');
