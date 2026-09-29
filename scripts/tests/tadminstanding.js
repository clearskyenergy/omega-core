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
/* 2026-09-28: the rules both the console and the account page read live in admin/admin-shared.js (standing, the book's words, the status chip, the signup in progress); the console keeps the inventory strip and the boot */
var SHARED = fs.readFileSync(path.join(__dirname, '../../admin/admin-shared.js'), 'utf8');
var ACCOUNT = fs.readFileSync(path.join(__dirname, '../../admin/account.js'), 'utf8');
var HTML = fs.readFileSync(path.join(__dirname, '../../admin/index.html'), 'utf8');
var ACCOUNT_HTML = fs.readFileSync(path.join(__dirname, '../../admin/account.html'), 'utf8');
function grabIn(src, name) {
  var needle = 'function ' + name + '(', i = src.indexOf(needle);
  if (i < 0) throw new Error('not found: ' + name);
  var k = src.indexOf('{', i), d = 0;
  for (;; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (!d) break; } }
  return src.slice(i, k + 1);
}
function grab(name) { return grabIn(SRC, name); }
function grabShared(name) { return grabIn(SHARED, name); }
var STATE = { priceBook: null };
var fns = new Function('STATE', 'esc', [grabShared('_standing'), grabShared('_pkgPlanName'), grabShared('_pkgModules'), grabShared('_pkgModuleNames'), grab('_priceBookStrip'),
  /var SIGNUP_STAGES = \{[^;]*\};/.exec(SHARED)[0], grabShared('_isSignup'), grabShared('_reqSignupLine'), grabShared('_accountHref'),
  'return { standing: _standing, plan: _pkgPlanName, modules: _pkgModules, names: _pkgModuleNames, strip: _priceBookStrip, signupLine: _reqSignupLine, isSignup: _isSignup, href: _accountHref };'].join('\n'))(STATE, function (s) { return String(s == null ? '' : s); });
var n = 0; function ok(c, m) { assert.ok(c, m); n++; }
var DAY = 86400000, soon = new Date(Date.now() + 5 * DAY).toISOString().slice(0, 10), later = new Date(Date.now() + 40 * DAY).toISOString().slice(0, 10);
function pk(b) { return fns.standing(Object.assign({ packaged: true }, b), { status: 'active' }); }

ok(pk({ packagingState: 'paid', nextInvoiceOn: later }).key === 'current' && pk({ packagingState: 'paid', nextInvoiceOn: later }).label === 'Active', 'paid, invoice far off: current');
ok(pk({ packagingState: 'paid', nextInvoiceOn: soon }).key === 'duesoon' && pk({ packagingState: 'paid', nextInvoiceOn: soon }).chip === 'good', 'paid, invoice inside 14 days: due soon, still good');
ok(pk({ packagingState: 'awaiting_payment', amountDue: 2250 }).key === 'awaiting' && /first payment/i.test(pk({ packagingState: 'awaiting_payment' }).label), 'awaiting the first payment has its own key');
ok(pk({ packagingState: 'past_due_lite' }).key === 'overdue' && /Omega Design/.test(pk({ packagingState: 'past_due_lite' }).label), 'past due on Lite is overdue and says so');
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
  enterprise: { name: 'Enterprise', priceDisplay: 'Contact for pricing' }, logins: { builderDisplay: '$50/month', viewerDisplay: '$15/month' }, modules: [{ key: 'lite', name: 'Omega Design', monthlyDisplay: '$500/month' }, { key: 'gridatlas', name: 'Omega Grid', monthlyDisplay: '$250/month' }] };
ok(fns.plan({ plan: 'pro' }) === 'Pro' && fns.names(['lite', 'gridatlas']).join(', ') === 'Omega Design, Omega Grid', 'with the book loaded the words are the book\'s');
ok(fns.modules({ subscription: { modules: ['lite', 'gridatlas'] }, modules: ['lite'] }).join() === 'lite,gridatlas', 'the package is what was bought, not what is on');
ok(fns.modules({ proposedPackage: { modules: ['lite', 'storage'] } }).join() === 'lite,storage', 'a proposed package counts before activation');
var strip = fns.strip();
ok(/Price book 2026-10/.test(strip) && /Field<\/b> \$1,299\/month/.test(strip) && /Omega Grid \$250\/month/.test(strip) && /Enterprise<\/b> Contact for pricing/.test(strip) && !/150,000/.test(strip) && /legacy roster/.test(strip), 'the inventory strip prints the book, server-formatted');
ok(!/1299|2499|150000/.test(grab('_priceBookStrip')), 'and carries no price of its own');
ok(/fetch\('\/api\/offerings'/.test(grab('loadPriceBook')) && /loadPriceBook\(\);\n  loadTenants\(\);/.test(SRC), 'the book is fetched at boot, before the tenants');
ok(/id="cl-pricebook"/.test(HTML), 'Client Inventory has the strip');
ok(/Open the Package panel/.test(ACCOUNT) && /Move this workspace to a package/.test(ACCOUNT), 'on the account page a packaged workspace is sent to its Package panel; a legacy one may move');

/* ── ONE PAGE PER ACCOUNT (2026-09-28): every list on the console opens /admin/account.html, the drawer is gone, and both pages load the shared rules ── */
ok(fns.href('Acme.Example') === '/admin/account.html?org=acme.example', 'the account page address, lower-cased');
ok(/onclick="openAccount\(event,&quot;'\+esc\(r\._id\)\+'&quot;\)"/.test(SRC) && /href="'\+_accountHref\(r\._id\)\+'">'\+esc\(r\.name\|\|r\._id\)/.test(SRC), 'a tenant row opens its account page');
ok(!/openTenantDetail|_tnDetailHtml|tn-users-/.test(SRC), 'the inline Manage drawer is gone from the console');
ok(/<script src="\/admin\/admin-shared\.js"><\/script>\s*<script src="\/admin\/admin-console\.js"><\/script>/.test(HTML), 'the console loads the shared rules first');
ok(/<script src="\/admin\/admin-shared\.js"><\/script>\s*<script src="\/admin\/account\.js"><\/script>/.test(ACCOUNT_HTML) && /admin\/package-panel\.js/.test(ACCOUNT_HTML), 'and so does the account page, with the Package panel');
ok(!/function _standing\(|function _pkgPlanName\(|function accessFor\(/.test(SRC) && !/function _standing\(|function accessFor\(/.test(ACCOUNT), 'neither page keeps a copy of a shared rule');
ok(/function _tnDetailHtml\(/.test(ACCOUNT) && /function saveTenantBilling\(/.test(ACCOUNT) && /function userAdmin\(/.test(ACCOUNT) && /function saveTenantRelationship\(/.test(ACCOUNT), 'the controls moved to the account page');
ok(/reconcile-now/.test(ACCOUNT) && /action: 'reject'/.test(ACCOUNT) && /nothing is deleted/i.test(ACCOUNT), 'the account page looks at the payment through plan-change and cancels through tenant-approve, never a delete');
ok(/\.chip\.good\{/.test(HTML) && /\.chip\.bad\{/.test(HTML) && /\.chip\.good\{/.test(ACCOUNT_HTML), 'standing chips have their colours on both pages');

/* ── THE SIGNUP IN PROGRESS: one row in the queue from the account on, in words ── */
STATE.priceBook = null;
ok(fns.isSignup({ source: 'signup' }) && !fns.isSignup({ source: 'clearsky' }) && !fns.isSignup({}), 'a signup row is known by its source');
ok(fns.signupLine({ source: 'signup', signup: { stage: 'account' } }) === 'Creating the account · No system chosen yet', 'the account just made');
ok(fns.signupLine({ source: 'signup', signup: { stage: 'system', modules: ['lite', 'gridatlas'], priceDisplay: '$750/month', interval: 'monthly', emailVerified: false, updatedAt: '2026-09-28T19:00:00.000Z' } }, fns.names) === 'Building their system · System: lite, gridatlas · $750/month · email not confirmed · last step 2026-09-28', 'the system, the server\'s price, the unconfirmed address and the last step; keys before the book loads');
STATE.priceBook = { modules: [{ key: 'lite', name: 'Omega Design' }, { key: 'gridatlas', name: 'Omega Grid' }] };
ok(fns.signupLine({ source: 'signup', signup: { stage: 'billing', modules: ['lite', 'gridatlas'], priceDisplay: '$7,500/year', interval: 'annual' } }, fns.names) === 'Entering billing · System: Omega Design, Omega Grid · $7,500/year (yearly)', 'the book\'s words once it loads, and a yearly figure says so');
ok(/Signing up · No system chosen yet/.test(fns.signupLine({ source: 'signup', signup: { stage: 'bogus' } })) && /Workspace made/.test(fns.signupLine({ signup: { stage: 'done' } })), 'an unknown stage reads plainly; done says the workspace was made');
ok(/_reqSignupLine\(r, _pkgModuleNames\)/.test(SRC) && /'in signup'/.test(SRC) && /_reqSignupLine\(r, _pkgModuleNames\)/.test(ACCOUNT), 'the request card and the account page print that line');
ok(/_setupWanted\(\)/.test(SRC) && /setUpFromRequest\(at\)/.test(SRC) && /\/admin\/\?setup=/.test(ACCOUNT), 'Set up the workspace from the account page lands on the console\'s New tenant form, filled in');

/* ── The Package tab (admin/package-panel.js) reads a LEGACY tenant the way
   the tenant's own Modules page does (review finding 24): the ONE legacy
   ctx, OmegaWorkspaceHub.legacyCtx — the tool levels omega-tenant.js gives
   the tier, the modules bought by card and on now, and Site Map's half as
   the catalog's legacyGates (read off the real editor) asked of the
   editor's own ladder through editorCtx(OmegaCaps, billing, who). Its
   "Holds" and "Partly on" lines and the activation preselection are built
   from that. Checked on the REAL tool catalog, module catalog, hub and
   capability ladder. */
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
/* what the tenant's Modules page shows: workspace.html hubCtx(), the ONE
   legacy ctx for the signed-in person, on omega-tenant.js's tier level */
var LEVEL = { trial: 3, standard: 1, pro: 2, deluxe: 2, enterprise: 3, internal: 3, partner: 2 };
function tenantReads(billing, org) {
  org = org || 'panel.example';
  var ws = { orgId: org, tierLevel: LEVEL[billing.tier] != null ? LEVEL[billing.tier] : 1, addons: billing.addons || [], toolAccess: billing.toolAccess || null, toolOverrides: billing.toolOverrides || null };
  var c = HUB.legacyCtx({ tools: TOOLS, ws: ws, billing: billing, caps: capsBox.OmegaCaps, who: { email: 'dana@' + org, emailVerified: true, orgId: org } });
  var out = { held: [], partly: [] };
  MODS.forEach(function (m) { var st = HUB.moduleState(m, c); if (st === 'held') out.held.push(m.key); else if (st === 'part') out.partly.push(m.key); });
  return out;
}
function tenantHolds(billing, org) { return tenantReads(billing, org).held; }
function legacyReads(billing, org) { var s = panelStanding({ orgId: org || 'panel.example', billing: billing, modules: MODS }); return { held: s.held, partly: s.partly }; }
var std = legacyReads({ tier: 'standard', addons: [] });
ok(std.held.join() === 'lite,evrebates,permitting', 'Standard holds Omega Design, Omega EV and Omega Permits, as its Modules page says: ' + std.held.join());
ok(['gridatlas', 'storage', 'compute'].every(function (k) { return std.partly.indexOf(k) >= 0; }), 'and Omega Grid, Omega Storage and Omega Compute are only partly on it (Site Map keeps some of their commands closed on Standard): ' + std.partly.join());
var deluxe = legacyReads({ tier: 'deluxe', addons: [] });
ok(deluxe.held.indexOf('plansets') >= 0 && deluxe.held.indexOf('siteintel') < 0 && deluxe.partly.indexOf('siteintel') >= 0 && deluxe.partly.indexOf('compute') >= 0, 'Deluxe holds Omega Plans (Site Map prints them) and only partly Omega Intel and Omega Compute: ' + JSON.stringify(deluxe));
ok(legacyHolds({ tier: 'trial', addons: [] }).indexOf('whitelabel') < 0 && legacyHolds({ tier: 'enterprise', addons: [] }).indexOf('whitelabel') < 0 && legacyHolds({ tier: 'standard', addons: ['whitelabel'] }).indexOf('whitelabel') >= 0, 'the Storefront is held where its own gate opens it (the add-on), never on the tier: not on a trial, not on Enterprise alone');
var capped = legacyReads({ tier: 'deluxe', capTier: 'standard', addons: [] });
ok(capped.held.indexOf('plansets') < 0 && capped.partly.indexOf('plansets') >= 0, 'capTier scopes Site Map below the billed tier, as the editor does: ' + JSON.stringify(capped));
var LIVE = { modules: ['logic-office'], live: ['logic-office'], state: 'paid', accessUntil: Date.now() + 10 * DAY, nextInvoiceOn: '2026-10-27' };
[{ tier: 'trial' }, { tier: 'standard' }, { tier: 'standard', addons: ['compute'] }, { tier: 'deluxe' }, { tier: 'deluxe', capTier: 'standard' }, { tier: 'enterprise' }, { tier: 'standard', toolAccess: ['editor', 'gridatlas'] }, { tier: 'deluxe', toolOverrides: { batterysizer: false } },
  { tier: 'standard', addOns: LIVE }, { tier: 'enterprise', addOns: Object.assign({}, LIVE, { accessUntil: Date.now() - DAY }) }].forEach(function (b) {
  b.addons = b.addons || [];
  var panel = legacyReads(b), page = tenantReads(b);
  ok(JSON.stringify(panel) === JSON.stringify(page), 'the Package tab reads what the tenant\'s Modules page shows, Live and Partly, for ' + JSON.stringify(b) + ': ' + JSON.stringify(panel) + ' vs ' + JSON.stringify(page));
});
ok(legacyHolds({ tier: 'standard', addons: [], addOns: LIVE }).indexOf('logic-office') >= 0, 'an add-on bought by card and on now is held');
ok(legacyHolds({ tier: 'standard', addons: [], addOns: Object.assign({}, LIVE, { accessUntil: Date.now() - DAY }) }).indexOf('logic-office') < 0, 'and not once the month it paid for (and the grace) is over');
var ending = panelStanding({ orgId: 'panel.example', modules: MODS, billing: { tier: 'standard', addons: [], addOns: Object.assign({}, LIVE, { ending: { 'logic-office': { status: 'requested', endsOn: '2026-10-27' } } }) } });
ok(ending.held.indexOf('logic-office') >= 0 && ending.preselect.indexOf('logic-office') < 0 && ending.notes['logic-office'] === 'Add-on ending' && ending.lines.some(function (l) { return /^Add-ons ending: Logic Office/.test(l); }),
  'an add-on opted out of on its card is still held until it ends, is named as ending, and is not preselected');
var pre = panelStanding({ orgId: 'panel.example', modules: MODS, billing: { tier: 'standard', addons: [], optIns: { siteintel: { status: 'requested', name: 'Omega Intel' } }, optOuts: { storage: { status: 'requested', name: 'Omega Storage' } } } });
var preRule = std.held.concat(std.partly, ['siteintel']).filter(function (k, i, a) { return k !== 'storage' && a.indexOf(k) === i; }).sort();
ok(pre.preselect.slice().sort().join() === preRule.join() && pre.preselect.indexOf('storage') < 0, 'the preselection is what it holds or partly uses, plus the opt-in, less the opt-out: ' + pre.preselect.join());
var trialPre = panelStanding({ orgId: 'panel.example', modules: MODS, billing: { tier: 'trial', addons: [], optIns: { gridatlas: { status: 'requested', name: 'Omega Grid' } } } });
ok(trialPre.held.length > 2 && trialPre.preselect.slice().sort().join() === 'gridatlas,lite', 'a pending trial holds what the trial opens, but the package staff approve (and bill at trial end) starts from Omega Design plus what it asked for: ' + trialPre.preselect.join());
var answeredStand = panelStanding({ orgId: 'panel.example', modules: MODS, billing: { tier: 'standard', addons: [], optOuts: { compute: { status: 'done', name: 'Omega Compute', resolvedAt: '2026-09-27', resolvedBy: 'staff@clearsky-usa.com' } } } });
ok(answeredStand.optingOut.length === 0 && answeredStand.lines.some(function (l) { return l === 'Answered: Omega Compute opt-out done 2026-09-27 by staff@clearsky-usa.com'; }), 'an answered request is no longer open, and the strip says who answered it');
ok(/legacyCtx\(/.test(grabFrom(PANEL, 'standing')) && !/editorCtx\(|capsFor\(/.test(grabFrom(PANEL, 'standing')), 'the Package tab builds no ctx of its own: the one legacy ctx');
var capsAt = TENANT_HTML.indexOf('<script src="/omega-caps.js"></script>'), panelAt = TENANT_HTML.indexOf('<script src="/admin/package-panel.js"></script>');
ok(capsAt > 0 && capsAt < panelAt && TENANT_HTML.indexOf('/omega-workspace-hub.js') < panelAt, 'admin/tenant.html loads the capability library and the hub before the panel');
ok(TENANT_HTML.split('src="/omega-caps.js"').length === 2 && TENANT_HTML.split('src="/omega-workspace-hub.js"').length === 2, 'and loads each once');
ok(/'resolve-opt-in' : 'resolve-opt-out'/.test(grabFrom(PANEL, 'answer')) && /request\('\/api\/plan-change'/.test(grabFrom(PANEL, 'answer')), 'each open request is answered through plan-change, never a billing write from the page');
console.log('admin standing: ' + n + ' checks passed.');
