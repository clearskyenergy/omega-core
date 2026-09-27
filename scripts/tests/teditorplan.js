#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   Site Map says how a workspace pays and what its modules are
   (omega-editor-plan.js), and the doors under it tell the truth.

   1. What the plan chip and its panel say, from REAL server projections
      (api/_lib/package-access.js) and the REAL price list (api/offerings
      view): a packaged workspace live, read-only, overdue, on a trial, a
      viewer, staff, a preview, unchecked; the server's figures or none;
      the changes in progress in the contract's words; In Site Map and
      Elsewhere split by the price list's own flag, the catalog ribbon
      agreeing with it; read-only for the bill (I've paid) apart from
      read-only for a viewer (no payment offered); a legacy plan's modules
      by the Modules page's own rule (OmegaWorkspaceHub.moduleState on the
      tier OmegaWorkspaceHub.editorCtx names), and its opt-in and opt-out
      requests only where the Modules page's card shows them in flight.
   2. The copies that cannot be avoided stay copies: the tier names are
      omega-tenant.js's, and the read-only commands an unchecked plan keeps
      are the server's M.readOnlyRibbon().
   3. OmegaCaps: a failed read leaves the plan UNCHECKED (viewing stays,
      producing waits), a failed package fetch too, and retry() replaces
      the fail-safe without a reload — keeping it unchecked while its read
      is out.
   4. The editor gate: a check that could not run shows its reason and
      Retry, never "not on this plan"; a real refusal says "not on this
      plan" and links the Modules page; a 403 from the package check is a
      refusal in the server's words, no Retry; a packaged workspace's
      status is read first; the org's toolAccess allowlist wins and a
      missing record still fails open.
   5. editor.html mounts the chip and loads the file; never omega-tenant.js.

   node scripts/tests/teditorplan.js */
'use strict';
var fs = require('fs'), path = require('path'), ROOT = path.join(__dirname, '..', '..');
var F = require(path.join(ROOT, 'scripts', '_lib', 'firestore-double.js'));
F.mock('../api/_lib/admin', { handler: function (fn) { return fn; }, db: function () { return null; },
  httpError: function (s, m) { var e = new Error(m); e.status = s; return e; } });
var M = require(path.join(ROOT, 'api', '_lib', 'modules.js'));
var X = require(path.join(ROOT, 'api', '_lib', 'package-access.js'));
var B = require(path.join(ROOT, 'api', '_lib', 'pricebook.js'));
var OFFER = require(path.join(ROOT, 'api', 'offerings.js')).view(B.proposed(), 'proposed');
var PLAN = require(path.join(ROOT, 'omega-editor-plan.js'));
var HUB = require(path.join(ROOT, 'omega-workspace-hub.js'));
var TOOLS = require(path.join(ROOT, 'omega-tools.js'));
global.window = global; require(path.join(ROOT, 'omega-caps.js')); var CAPS = global.OmegaCaps;
var pass = 0, fail = 0;
function ok(m, c, got) { if (c) { pass++; return; } fail++; console.log('  FAIL ' + m + (got !== undefined ? '  got: ' + JSON.stringify(got) : '')); }
function keys(rows) { return rows.map(function (r) { return r.key; }); }
function same(a, b) { return JSON.stringify(a.slice().sort()) === JSON.stringify(b.slice().sort()); }

var DAY = 86400000, NOW = Date.now(), PAY = 'https://app.qbo.intuit.com/app/customer/pay/abc';
var CAT = M.catalog(), ALL = CAT.map(function (m) { return m.key; });
var OUTSIDE = OFFER.modules.filter(function (m) { return !m.editor; }).map(function (m) { return m.key; });
function projection(modules, bill, member) {
  return X.project({ emailVerified: true }, Object.assign({ packaged: true, packagingState: 'paid', accessUntil: NOW + 30 * DAY, modules: modules }, bill || {}),
    { status: 'active' }, member || { role: 'owner', status: 'active' }, NOW);
}
function packaged(modules, extra) { return PLAN.summary(Object.assign({ view: projection(modules), offerings: OFFER }, extra || {})); }

/* ── 1 · packaged ─────────────────────────────────────────────────────── */
var lite = packaged(['lite']);
ok('Lite, paid: the chip says Lite and Live', lite.state === 'live' && lite.plan === 'Lite' && lite.suffix === '' && lite.pill === 'Live', lite);
ok('Lite lives in Site Map and nothing is elsewhere', same(keys(lite.inSiteMap), ['lite']) && lite.elsewhere.length === 0);
ok('every other module is counted as available, never listed as held', lite.notHeld === CAT.length - 1, lite.notHeld);
ok('the panel links Plan & billing and Modules on the workspace', lite.links.map(function (l) { return l.href; }).join() === '/workspace#billing,/workspace#modules' && /Plan & billing/.test(lite.links[0].text) && /Modules/.test(lite.links[1].text));

var ev = packaged(M.starters().ev);
ok('the EV starter lists exactly its modules in Site Map', same(keys(ev.inSiteMap), M.starters().ev) && !ev.elsewhere.length, keys(ev.inSiteMap));
ok('names are the catalog\'s', ev.inSiteMap.every(function (r) { return r.name === M.get(r.key).name; }));
ok('a count, not a list, names the plan until the server says more', ev.plan === 'Lite + ' + (M.starters().ev.length - 1) + ' modules', ev.plan);

var mixed = packaged(['lite', 'storage', 'whitelabel', 'sitefinder', 'logic-office', 'logic-plant']);
ok('modules that live outside Site Map are Elsewhere', same(keys(mixed.elsewhere), ['whitelabel', 'sitefinder', 'logic-office', 'logic-plant']), keys(mixed.elsewhere));
ok('and the editor ones are In Site Map', same(keys(mixed.inSiteMap), ['lite', 'storage']), keys(mixed.inSiteMap));

var every = packaged(ALL);
ok('everything: each module is in exactly one place', every.inSiteMap.length + every.elsewhere.length === CAT.length && every.notHeld === 0);
ok('Elsewhere is exactly what the price list marks as outside the editor', same(keys(every.elsewhere), OUTSIDE), keys(every.elsewhere));
var noList = PLAN.summary({ view: projection(ALL) });
ok('before the price list loads, the catalog ribbon splits the modules the same way', same(keys(noList.elsewhere), OUTSIDE) && same(keys(noList.inSiteMap), keys(every.inSiteMap)));
ok('the ribbon fallback agrees with the server flag for every module sold', CAT.every(function (m) { var o = OFFER.modules.filter(function (x) { return x.key === m.key; })[0]; return PLAN.inEditor(m, null) === o.editor; }));

/* read-only: the trial ran out and the first invoice is not paid */
var expired = projection(['lite', 'gridatlas'], { packagingState: 'trial', trialStartedAt: NOW - 20 * DAY, trialEndsAt: NOW - 6 * DAY, accessUntil: NOW - 6 * DAY, paymentLink: PAY });
var ro = PLAN.summary({ view: expired, offerings: OFFER });
ok('the projection is read-only with a notice (fixture sanity)', expired.readOnly === true && expired.billingNotice && expired.billingNotice.payUrl === PAY);
ok('read-only: the chip says so', ro.state === 'readonly' && ro.suffix === ' · Read-only' && ro.tone === 'bad', ro);
ok('the panel carries the server\'s notice, its pay link and I\'ve paid', ro.notice.text === expired.billingNotice.text && ro.notice.payUrl === PAY && ro.notice.paid === true);
ok('a read-only workspace still sees its modules', same(keys(ro.inSiteMap), ['lite', 'gridatlas']));

var viewer = PLAN.summary({ view: projection(['lite'], null, { role: 'viewer', status: 'active' }) });
ok('a viewer on a live plan is read-only by role, told so, and offered no payment', viewer.state === 'viewer' && viewer.suffix === ' · Read-only' && viewer.notice && !viewer.notice.paid && !viewer.notice.payUrl && /view/.test(viewer.notice.text));

var overdue = projection(['lite'], { packagingState: 'past_due_lite', paidThrough: '2026-09-01', paymentLink: PAY });
var due = PLAN.summary({ view: overdue });
ok('overdue on Lite: Payment due, still working', overdue.readOnly === false && due.state === 'due' && due.suffix === ' · Payment due' && due.notice.payUrl === PAY && due.notice.paid);

var trial = projection(['lite', 'storage'], { packagingState: 'trial', trialStartedAt: NOW - 11 * DAY, trialEndsAt: NOW + 3 * DAY, accessUntil: NOW + 3 * DAY });
var tr = PLAN.summary({ view: trial });
ok('the trial\'s last days: Live, with the server\'s reminder and no pay button', tr.state === 'live' && tr.notice && /trial ends/i.test(tr.notice.text) && !tr.notice.paid);

/* review #22: a viewer is read-only by role, and in a trial's last days the
   projection also carries the reminder. That is not an unpaid plan. */
var TRIAL_END = { packagingState: 'trial', trialStartedAt: NOW - 11 * DAY, trialEndsAt: NOW + 3 * DAY, accessUntil: NOW + 3 * DAY };
var viewerTrial = projection(['lite', 'storage'], TRIAL_END, { role: 'viewer', status: 'active' });
var vt = PLAN.summary({ view: viewerTrial, now: NOW });
ok('fixture: a viewer on a trial\'s last days is read-only with the reminder', viewerTrial.readOnly === true && viewerTrial.billingNotice && !viewerTrial.billingNotice.payUrl);
ok('a viewer on a live trial\'s last days is View only, not the red billing Read-only', vt.state === 'viewer' && vt.tone !== 'bad' && vt.pill === 'View only', vt);
ok('and is offered no I\'ve paid (reconcile-now answers an owner or administrator only) and no pay link', !vt.notice.paid && !vt.notice.payUrl);
ok('and still reads the server\'s reminder, after what a viewer may do', /view projects/.test(vt.notice.text) && /trial ends/i.test(vt.notice.text), vt.notice.text);
var expiredNoLink = projection(['lite'], { packagingState: 'trial', trialStartedAt: NOW - 20 * DAY, trialEndsAt: NOW - 6 * DAY, accessUntil: NOW - 6 * DAY });
var enl = PLAN.summary({ view: expiredNoLink, now: NOW });
ok('an expired trial with no pay link on file is still the bill: Read-only and I\'ve paid', enl.state === 'readonly' && enl.notice.paid === true && !enl.notice.payUrl, enl);
ok('an expired trial seen by a viewer is the bill too', PLAN.summary({ view: projection(['lite'], { packagingState: 'trial', trialStartedAt: NOW - 20 * DAY, trialEndsAt: NOW - 6 * DAY, accessUntil: NOW - 6 * DAY, paymentLink: PAY }, { role: 'viewer', status: 'active' }), now: NOW }).state === 'readonly');
/* the server's own word, when the projection carries it */
var liveViewer = projection(['lite'], { packagingState: 'past_due_lite', paidThrough: '2026-09-01', paymentLink: PAY }, { role: 'viewer', status: 'active' }); liveViewer.live = true;
var lv = PLAN.summary({ view: liveViewer, now: NOW });
ok('with the server\'s live flag, a viewer on an overdue Lite is View only with the overdue note and no payment', lv.state === 'viewer' && !lv.notice.paid && !lv.notice.payUrl && /overdue/i.test(lv.notice.text), lv);
var deadViewer = projection(['lite'], TRIAL_END, { role: 'viewer', status: 'active' }); deadViewer.live = false;
ok('and live:false is the bill, whatever the dates say', PLAN.summary({ view: deadViewer, now: NOW }).state === 'readonly');

var staff = PLAN.summary({ view: X.project({ staff: true }, { packaged: true }, null, null), offerings: OFFER });
ok('staff: every module, named as staff', staff.state === 'staff' && staff.plan === 'Staff · every module' && staff.inSiteMap.length + staff.elsewhere.length === CAT.length);
var preview = projection(['lite']); preview.preview = true; preview.canPreview = true;
ok('a staff preview says it is a preview', PLAN.summary({ view: preview }).plan === 'Preview · Lite');

var unchecked = PLAN.summary({ view: CAPS.unverifiedPackage() });
ok('an unchecked plan says so and offers Retry', unchecked.state === 'unchecked' && unchecked.retry && /could not be checked/.test(unchecked.notice.text) && /pricing could not be loaded/i.test(unchecked.notice.text));
ok('and lists nothing it cannot know', !unchecked.listed && !unchecked.inSiteMap.length);
ok('the short wait for a projection shows no chip', PLAN.summary({ view: CAPS.pendingPackage() }).state === 'checking' && PLAN.summary({}).state === 'checking');

/* the server's figures, or none */
var FIGS = { packaged: true, planDisplay: 'Field', monthlyDisplay: '$1,250.00/month', interval: 'monthly', nextInvoiceOn: '2026-10-01', amountDue: 0,
  modules: ['lite', 'evrebates', 'estimate'], subscription: ['lite', 'evrebates', 'estimate', 'storage'],
  pending: [{ id: 'chg1', add: ['gridatlas'], paymentLink: PAY, display: '$120.00' }], removalRequests: [{ module: 'estimate' }],
  invoices: [{ state: 'paid', kind: 'recurring', paymentLink: null }] };
var fig = packaged(['lite', 'evrebates', 'estimate'], { figures: FIGS });
ok('the plan takes the server\'s name when it has one', fig.plan === 'Field', fig.plan);
ok('the monthly figure and next invoice are the server\'s, the date as written', fig.figures.monthly === '$1,250.00/month' && fig.figures.next === 'Oct 1, 2026', fig.figures);
ok('the generic à la carte name gives way to the count', packaged(['lite', 'storage'], { figures: { planDisplay: 'Lite + modules' } }).plan === 'Lite + 1 module');
var ch = {}; fig.changes.forEach(function (c) { ch[c.key] = c; });
ok('a change invoice waiting for payment, with its pay link', ch.gridatlas && ch.gridatlas.pill === 'Waiting for payment' && ch.gridatlas.payUrl === PAY && ch.gridatlas.name === 'Grid Atlas');
ok('bought but not on yet', ch.storage && ch.storage.pill === 'Bought · not on yet');
ok('a queued removal is Opting out', ch.estimate && ch.estimate.pill === 'Opting out');
var failed = packaged(['lite', 'storage'], { figures: { error: true } });
ok('a summary that failed (503, 403) shows the plan and modules, no figures, no error', failed.state === 'live' && failed.figures === null && failed.inSiteMap.length === 2 && !/\$/.test(JSON.stringify(failed)));
var owe = packaged(['lite'], { figures: { amountDue: 125, amountDueDisplay: '$125.00', invoices: [{ state: 'unpaid', kind: 'recurring', paymentLink: PAY }, { state: 'unpaid', kind: 'change', paymentLink: 'https://x.intuit.com/c' }] } });
ok('an amount due and the recurring invoice\'s pay link, never a change invoice\'s', owe.figures.due === '$125.00' && owe.figures.payUrl === PAY);
var WORDS = /Subscribe|\bAsk\b|Keep module/;
ok('no contract-forbidden words in anything the panel says', ![lite, ev, ro, viewer, due, tr, vt, enl, lv, staff, unchecked, fig, owe].some(function (s) { return WORDS.test(JSON.stringify(s)); }));

/* ── 1b · legacy ─────────────────────────────────────────────────────── */
/* the Modules page's ctx, built as workspace.html's hubCtx() builds it:
   the tools by omega-tools, Site Map by OmegaWorkspaceHub.editorCtx */
function legacyCtx(tier, b) {
  var level = PLAN.TIER_LEVEL[b.tier || 'standard'], ws = { orgId: 'tenant.example', tierLevel: level, addons: b.addons || [] };
  if (b.toolOverrides) ws.toolOverrides = b.toolOverrides; if (Array.isArray(b.toolAccess)) ws.toolAccess = b.toolAccess;
  var c = { packaged: false, tierLevel: level, addons: ws.addons, modules: [], canOpen: function (k) { var t = TOOLS.byKey(k); return !!t && TOOLS.isUnlocked(t, ws); },
    tool: function (k) { return TOOLS.byKey(k); } };
  var e = HUB.editorCtx(CAPS, b, { orgId: 'tenant.example' });
  c.editorCan = e.editorCan; c.ungated = e.ungated; c.editorTier = e.tier;
  return c;
}
function legacy(tier, billing) {
  CAPS.setAddons(billing && billing.addons || []);
  return PLAN.summary({ tier: tier, billing: billing, offerings: OFFER, hub: HUB, tools: TOOLS, caps: CAPS, org: 'tenant.example' });
}
var del = legacy('deluxe', { tier: 'deluxe' });
ok('legacy Performance: the chip says the tier\'s name', del.state === 'legacy' && del.plan === 'Performance' && del.pill === 'Live', del);
ok('Performance holds Plan Sets in Site Map (the editor prints them on this tier)', keys(del.inSiteMap).indexOf('plansets') >= 0);
var compute = del.inSiteMap.filter(function (r) { return r.key === 'compute'; })[0];
ok('Compute is only partly included: its tools open, Site Map\'s compute tab does not', compute && compute.pill === 'Partly included', compute);
['standard', 'deluxe', 'enterprise', 'trial'].forEach(function (t) {
  var s = legacy(t, { tier: t }), held = keys(s.inSiteMap.concat(s.elsewhere).filter(function (r) { return !r.pill; }));
  var rule = CAT.filter(function (m) { return HUB.moduleState(m, legacyCtx(t, { tier: t })) === 'held'; }).map(function (m) { return m.key; });
  ok(t + ': the chip holds exactly what the Modules page\'s rule holds', same(held, rule), [held, rule]);
});
ok('Standard does not hold Plan Sets', keys(legacy('standard', { tier: 'standard' }).inSiteMap).indexOf('plansets') < 0);
/* the tier is editorCtx's (review brief): the chip's own tier LEVEL made a
   legacy trial Enterprise for a module with nothing to count */
var trialHeld = legacy('trial', { tier: 'trial' });
ok('a legacy trial does not hold White Label: Site Map runs trial, not Enterprise (editorCtx)', keys(trialHeld.elsewhere).indexOf('whitelabel') < 0 && HUB.moduleState(CAT.filter(function (m) { return m.key === 'whitelabel'; })[0], legacyCtx('trial', { tier: 'trial' })) === 'ask', keys(trialHeld.elsewhere));
ok('Enterprise still holds White Label', keys(legacy('enterprise', { tier: 'enterprise' }).elsewhere).indexOf('whitelabel') >= 0);
ok('capTier through editorCtx: billed Enterprise, capped Standard holds no Plan Sets', keys(legacy('standard', { tier: 'enterprise', capTier: 'standard' }).inSiteMap).indexOf('plansets') < 0);
CAPS.setAddons(['permitting']); var addonsBefore = CAPS.addons().join(), orgBefore = CAPS.org();
PLAN.summary({ tier: 'deluxe', billing: { tier: 'deluxe', addons: ['compute'] }, offerings: OFFER, hub: HUB, tools: TOOLS, caps: CAPS, org: 'other.example', who: { email: 'dana@other.example', emailVerified: true } });
ok('the chip only reads OmegaCaps: the org and add-ons Site Map is gating with are untouched by its judgement', CAPS.addons().join() === addonsBefore && CAPS.org() === orgBefore, [CAPS.addons(), CAPS.org()]);
CAPS.setAddons([]);
ok('a legacy trial holds no module Site Map withholds', keys(legacy('trial', { tier: 'trial' }).inSiteMap.filter(function (r) { return !r.pill; })).every(function (k) { return ['plansets', 'engineering', 'compute', 'siteintel', 'permitting'].indexOf(k) < 0; }));
var ent = legacy('enterprise', { tier: 'enterprise' }), entLogic = legacy('enterprise', { tier: 'enterprise', addons: ['omega-logic'] });
ok('Enterprise without the add-on holds no Omega Logic part', !keys(ent.elsewhere).some(function (k) { return /^logic-/.test(k); }));
ok('the omega-logic add-on puts every part Elsewhere', ['logic-office', 'logic-plant', 'logic-materials', 'logic-logistics', 'logic-customer'].every(function (k) { return keys(entLogic.elsewhere).indexOf(k) >= 0; }));
var two = legacy('enterprise', { tier: 'enterprise', toolAccess: ['editor', 'gridatlas'] });
ok('the two-tool product: its allowlist narrows what is held', keys(two.inSiteMap).indexOf('storage') < 0 && two.inSiteMap.some(function (r) { return r.key === 'gridatlas'; }), keys(two.inSiteMap));
ok('a missing billing record reads as Standard, as the workspace reads it', legacy('trial', {}).plan === 'Standard');
ok('an unreadable billing record names the tier Site Map is running', legacy('deluxe', { failed: true }).plan === 'Performance');
ok('the record on its way shows no chip yet', legacy('deluxe', null).state === 'checking');
var capped = legacy('standard', { tier: 'enterprise', capTier: 'standard' });
ok('capTier: billed Enterprise, Site Map scoped to Standard, and it says so', capped.plan === 'Enterprise' && /Site Map is set to Standard/.test(capped.note), capped);
var legacyTrial = legacy('trial', { tier: 'trial', trialEndsAt: '2026-10-09' });
ok('a legacy trial names its end date', legacyTrial.pill === 'Trial' && /Oct 9, 2026/.test(legacyTrial.notice.text));
var asked = legacy('standard', { tier: 'standard', optIns: { plansets: { status: 'requested' }, finance: { status: 'withdrawn' } }, optOuts: { gridatlas: { status: 'requested' } } });
var ach = {}; asked.changes.forEach(function (c) { ach[c.key] = c.pill; });
ok('legacy requests are in progress in the contract\'s words', ach.plansets === 'Opt-in requested' && ach.gridatlas === 'Opting out' && !ach.finance, asked.changes);
/* review #10: only package activation closes a request, so one ClearSky met
   by editing the tier stays 'requested'. The Modules page's card calls it
   answered; so does the chip, and they read one rule (moduleCard). */
var STALE = { tier: 'standard', optIns: { storage: { status: 'requested', requestedAt: '2026-09-01' } }, optOuts: { plansets: { status: 'requested', requestedAt: '2026-09-01' } } };
var stale = legacy('standard', STALE), sch = {}; stale.changes.forEach(function (c) { sch[c.key] = c.pill; });
var storageM = CAT.filter(function (m) { return m.key === 'storage'; })[0], plansetsM = CAT.filter(function (m) { return m.key === 'plansets'; })[0];
ok('fixture: Standard holds Storage and not Plan Sets', HUB.moduleState(storageM, legacyCtx('standard', STALE)) === 'held' && HUB.moduleState(plansetsM, legacyCtx('standard', STALE)) === 'ask');
ok('an opt-in on a module the plan now holds is not "Opt-in requested": the card says Live', !sch.storage && HUB.moduleCard(storageM, legacyCtx('standard', STALE), STALE, null, {}).state === 'live', stale.changes);
ok('an opt-out of a module the plan no longer holds is not "Opting out": the card says Opt in', !sch.plansets && HUB.moduleCard(plansetsM, legacyCtx('standard', STALE), STALE, null, {}).state === 'available', stale.changes);
var REQ = { status: 'requested' };
var agree = [
  { tier: 'standard', optIns: { plansets: REQ, storage: REQ, compute: REQ }, optOuts: { gridatlas: REQ, evrebates: REQ, engineering: REQ } },
  { tier: 'deluxe', optIns: { permitting: REQ, plansets: REQ }, optOuts: { storage: REQ, whitelabel: REQ } }
].every(function (b) {
  var listed = {}; legacy(b.tier, b).changes.forEach(function (c) { listed[c.key] = c.pill; });
  return CAT.every(function (m) {
    var card = HUB.moduleCard(m, legacyCtx(b.tier, b), b, null, {});
    var inFlight = card.state === 'requested' || card.state === 'removing';
    return inFlight ? listed[m.key] === card.pill : !listed[m.key];
  });
});
ok('the chip lists exactly the legacy requests the Modules page\'s cards show in flight, in their words', agree);
var fresher = legacy('standard', { tier: 'standard' }), figsIn = PLAN.summary({ tier: 'standard', billing: { tier: 'standard' }, figures: { optIns: { plansets: { status: 'requested' } }, optOuts: {} }, offerings: OFFER, hub: HUB, tools: TOOLS, caps: CAPS, org: 'tenant.example' });
ok('the plan-change summary, the fresher record, carries the requests when it has loaded', !fresher.changes.length && figsIn.changes.length === 1 && figsIn.changes[0].pill === 'Opt-in requested');
ok('before the Modules page\'s libraries load, no request is listed that could contradict them', !PLAN.summary({ tier: 'standard', billing: STALE, offerings: OFFER }).changes.length);
var bare = PLAN.summary({ tier: 'deluxe', billing: { tier: 'deluxe' } });
ok('without the price list or the libraries the plan still shows, unlisted', bare.plan === 'Performance' && !bare.listed);
ok('ClearSky staff with no record are staff', PLAN.summary({ tier: 'internal', offerings: OFFER }).state === 'staff');
CAPS.setAddons([]);

ok('a calendar day as written, a timestamp as the viewer\'s day', PLAN.day('2026-10-01') === 'Oct 1, 2026' && PLAN.day(new Date(2026, 0, 5, 12).getTime()) === 'Jan 5, 2026' && PLAN.day({ seconds: new Date(2026, 1, 2, 12).getTime() / 1000 }) === 'Feb 2, 2026' && PLAN.day('') === '' && PLAN.day('nonsense') === '');

/* ── 2 · the unavoidable copies stay copies ──────────────────────────── */
var tenant = fs.readFileSync(path.join(ROOT, 'omega-tenant.js'), 'utf8');
function literal(name) { var m = new RegExp('var ' + name + ' = (\\{[^}]*\\});').exec(tenant); return m ? (new Function('return ' + m[1]))() : null; }
ok('the tier names are omega-tenant.js\'s', JSON.stringify(literal('TIER_LABEL')) === JSON.stringify(PLAN.TIER_LABEL), literal('TIER_LABEL'));
ok('the tier levels are omega-tenant.js\'s', JSON.stringify(literal('TIER_LEVEL')) === JSON.stringify(PLAN.TIER_LEVEL), literal('TIER_LEVEL'));
ok('an unchecked plan keeps exactly the server\'s read-only commands', JSON.stringify(CAPS.unverifiedPackage().readOnlyRibbon) === JSON.stringify(M.readOnlyRibbon()), CAPS.unverifiedPackage().readOnlyRibbon);

/* ── 3 · OmegaCaps: unchecked, not empty ─────────────────────────────── */
function elem(attrs, cls) { return { id: attrs.id || '', getAttribute: function (k) { return attrs[k] == null ? null : attrs[k]; }, classList: { contains: function (c) { return (cls || []).indexOf(c) >= 0; } } }; }
var failedDb = { collection: function () { return { doc: function () { return { collection: function () { return { doc: function () { return { get: function () { return Promise.reject(new Error('offline')); } }; } }; } }; } }; } };
async function capsChecks() {
  var t = await CAPS.resolve(failedDb, 'designer@tenant.example', true);
  var v = CAPS.packageAccess();
  ok('a failed read still resolves the fail-safe trial', t === 'trial');
  ok('and leaves the plan unchecked, not empty', v && v.unverified === true && v.readOnly === true && CAPS.unchecked() === true, v);
  ok('viewing and moving between projects stay', CAPS.allowedCommand('', 'openProjectsModal()') && CAPS.allowedCommand('', "rbTab('home')") && CAPS.allowedCommand('', 'toggleLayersPanel()') && CAPS.allowedCommand('', "openRpPanel('summary')"));
  ok('producing waits', !CAPS.allowedCommand('', 'openBlueprintExport()') && !CAPS.allowedCommand('', 'openBessSizer()') && !CAPS.allowedCommand('', 'saveProject()') && !CAPS.allowedCommand('rb-place-sub', 'rbInsert()'));
  ok('a button is judged by what it does, not an old module mark', CAPS.allowedElement(elem({ onclick: 'toggleSitePanel()', 'data-module': 'lite' })) && !CAPS.allowedElement(elem({ onclick: 'openPlotPlanExport()', 'data-cap': 'export.plotplan' })));
  ok('the capability set is view only', JSON.stringify(Object.keys(CAPS.setFor('trial'))) === '["view"]');

  /* Retry while its read is still out (review #19): the unchecked plan
     stays until the answer lands. It was cleared before the read, which
     showed and unguarded every producing command for as long as the read
     took. */
  var held = [];
  var heldDb = { collection: function () { return { doc: function () { return { collection: function () { return { doc: function () { return { get: function () {
    return new Promise(function (res, rej) { held.push({ res: res, rej: rej }); }); } }; } }; } }; } }; } };
  var out = CAPS.retry(heldDb, 'designer@tenant.example', true);
  var mid = CAPS.packageAccess();
  ok('a retry in flight keeps the plan unchecked', held.length === 1 && mid && mid.unverified === true && CAPS.unchecked() === true, mid);
  ok('and shows nothing that produces before the answer does', !CAPS.allowedCommand('', 'openBessSizer()') && !CAPS.allowedCommand('', 'openBlueprintExport()') &&
    !CAPS.allowedElement(elem({ onclick: 'openBessSizer()', 'data-module': 'engineering' })) && CAPS.allowedCommand('', 'openProjectsModal()'));
  held[0].rej(new Error('still offline'));
  ok('a retry that fails again leaves it unchecked', (await out) === 'trial' && CAPS.packageAccess().unverified === true && CAPS.unchecked() === true);
  held = [];
  out = CAPS.retry(heldDb, 'designer@tenant.example', true);
  ok('another retry in flight is still unchecked', CAPS.packageAccess() && CAPS.packageAccess().unverified === true);
  held[0].res({ exists: true, data: function () { return { tier: 'standard' }; } });
  ok('and its answer replaces the unchecked plan', (await out) === 'standard' && CAPS.packageAccess() === null && CAPS.unchecked() === false);
  await CAPS.resolve(failedDb, 'designer@tenant.example', true);

  var good = new F.DB(); good.seed('omega_orgs/tenant.example/billing/current', { tier: 'deluxe' });
  var r = await CAPS.retry(good, 'designer@tenant.example', true);
  ok('retry() finds the real answer and clears the unchecked plan', r === 'deluxe' && CAPS.packageAccess() === null && CAPS.unchecked() === false);
  ok('after a retry a legacy tier a caller kept from before means the answer', CAPS.apply('trial').tier === 'deluxe' && CAPS.apply('standard').tier === 'deluxe');
  await CAPS.resolve(good, 'designer@tenant.example', true);
  ok('a fresh resolve (another sign-in) forgets the retry', CAPS.apply('trial').tier === 'trial');

  CAPS.setPackage(projection(['lite']));
  var saved = global.fetch; global.fetch = function () { return Promise.resolve({ ok: false, json: function () { return Promise.resolve({}); } }); };
  var refused = await CAPS.fetchPackage({ getIdToken: function () { return Promise.resolve('t'); } }).then(function () { return false; }, function () { return true; });
  ok('a package fetch that fails leaves the plan unchecked', refused && CAPS.packageAccess().unverified === true);
  global.fetch = function () { return Promise.resolve({ ok: true, json: function () { return Promise.resolve(projection(['lite', 'storage'])); } }); };
  var fresh = await CAPS.fetchPackage({ getIdToken: function () { return Promise.resolve('t'); } });
  ok('and the next good answer replaces it', fresh.modules.join() === 'lite,storage' && !CAPS.packageAccess().unverified);
  global.fetch = saved;
  CAPS.setPackage(CAPS.pendingPackage());
  ok('the short wait still withholds everything', !CAPS.allowedCommand('', 'openProjectsModal()'));
  CAPS.setPackage(null);
}

/* ── 4 · the editor gate ─────────────────────────────────────────────── */
var gateSrc = fs.readFileSync(path.join(ROOT, 'omega-editor-gate.js'), 'utf8');
function runGate(docs, user, opts) {
  opts = opts || {};
  var els = {};
  function El(t) { this.tag = t; this.style = {}; this.children = []; }
  El.prototype.appendChild = function (c) { this.children.push(c); els[c.id] = c; return c; };
  El.prototype.setAttribute = function (k, v) { this[k] = v; };
  El.prototype.removeChild = function (c) { var i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); delete els[c.id]; };
  var body = new El('body'); body.id = 'body';
  var w = {
    location: { href: '', pathname: '/editor', search: '' },
    document: { body: body, documentElement: new El('html'), getElementById: function (id) { return els[id] || null; },
      createElement: function (t) { var e = new El(t); e.parentNode = body; return e; }, addEventListener: function () {} },
    setTimeout: function () {},
    fetch: opts.fetch || function () { return Promise.reject(new Error('offline')); },
    firebase: { apps: [1], auth: function () { return { currentUser: user, onAuthStateChanged: function () {} }; },
      firestore: function () { return { collection: function (c) { return { doc: function (d) {
        var key = c + '/' + d;
        function snap(k) { if (opts.failRead) return Promise.reject(new Error('offline')); return Promise.resolve({ exists: !!docs[k], data: function () { return docs[k]; } }); }
        return { get: function () { return snap(key); }, collection: function (c2) { return { doc: function (d2) { return { get: function () { return snap(key + '/' + c2 + '/' + d2); } }; } }; } };
      } }; } }; } },
    URLSearchParams: URLSearchParams, CustomEvent: function (n, o) { this.type = n; this.detail = o && o.detail; }, dispatchEvent: function () {}
  };
  w.window = w;
  new Function('window', 'document', 'setTimeout', 'module', 'var self=window;' + gateSrc)(w, w.document, w.setTimeout, { exports: {} });
  return w.OmegaEditorGate.decide(user).then(function () {
    return { allowed: !els['omega-editor-gate'], html: els['omega-editor-gate'] ? els['omega-editor-gate'].innerHTML : '' };
  });
}
var ORG = 'northgatefoods.com', USER = { email: 'dana@' + ORG, getIdToken: function () { return Promise.resolve('t'); } };
function org(billing) { var d = {}; d['omega_orgs/' + ORG] = { status: 'active' }; if (billing) d['omega_orgs/' + ORG + '/billing/current'] = billing; return d; }
async function gateChecks() {
  var r = await runGate(org({ tier: 'enterprise', toolAccess: ['gridatlas'] }), USER);
  ok('gate: an allowlist without the designer refuses, as a plan matter', !r.allowed && /not on this plan/.test(r.html), r.html.slice(0, 80));
  ok('gate: and links the workspace\'s Modules page in a new tab', /href="\/workspace#modules"[^>]*target="_blank"/.test(r.html) && /See modules ›/.test(r.html));
  ok('gate: an empty allowlist is authoritative too (absent ≠ empty)', !(await runGate(org({ tier: 'enterprise', toolAccess: [] }), USER)).allowed);
  ok('gate: the two-tool product gets in', (await runGate(org({ tier: 'enterprise', toolAccess: ['editor', 'gridatlas'] }), USER)).allowed);
  ok('gate: no allowlist is whatever the plan includes', (await runGate(org({ tier: 'standard' }), USER)).allowed);
  var noRecord = {}; noRecord['omega_orgs/' + ORG + '/billing/current'] = { toolAccess: [] };
  ok('gate: a MISSING omega_orgs record still fails open', (await runGate(noRecord, USER)).allowed);
  ok('gate: an override switch-off still refuses and says plan', /not on this plan/.test((await runGate(org({ tier: 'standard', toolOverrides: { editor: false } }), USER)).html));
  var blip = await runGate(org({ tier: 'standard' }), USER, { failRead: true });
  ok('gate: a read that failed shows its reason, never "not on this plan"', !blip.allowed && /Workspace access could not be checked/.test(blip.html) && !/not on this plan/.test(blip.html), blip.html.slice(0, 120));
  ok('gate: and offers Retry', /id="omega-gate-retry"[^>]*>Retry</.test(blip.html));
  var pkg = await runGate(org({ packaged: true }), USER, { fetch: function () { return Promise.resolve({ ok: false, json: function () { return Promise.resolve({}); } }); } });
  ok('gate: a package check that failed says so, with Retry', /Package access could not be checked/.test(pkg.html) && !/not on this plan/.test(pkg.html) && /omega-gate-retry/.test(pkg.html));
  var noEditor = await runGate(org({ packaged: true }), USER, { fetch: function () { return Promise.resolve({ ok: true, json: function () { return Promise.resolve({ packaged: true, toolAccess: ['gridatlas'] }); } }); } });
  ok('gate: a package without the designer is a plan refusal with the Modules link', /not on this plan/.test(noEditor.html) && /\/workspace#modules/.test(noEditor.html));

  /* review #20: /api/package-access answers 403 on purpose (the org not
     active, a disabled or roleless member, an unverified email). That is a
     refusal, never "could not check" with a Retry that hears it again; and
     a packaged workspace's own status is read before the package is. */
  function served(status, body) { return function () { return Promise.resolve({ ok: status >= 200 && status < 300, status: status, json: function () { return Promise.resolve(body); } }); }; }
  function answered(fn) { var n = 0; return { fetch: function () { n++; return fn(); }, calls: function () { return n; } }; }
  function withStatus(status, billing) { var d = org(billing); d['omega_orgs/' + ORG] = { status: status }; return d; }
  var server = answered(served(403, { error: 'Active organization membership required' }));
  var signup = await runGate(withStatus('pending', { packaged: true, packagingState: 'pending' }), USER, { fetch: server.fetch });
  ok('gate: a packaged self-serve signup awaiting approval is being set up', !signup.allowed && /being set up/.test(signup.html) && !/omega-gate-retry/.test(signup.html) && !/could not/i.test(signup.html), signup.html.slice(0, 120));
  ok('gate: and its status is read before the package is asked', server.calls() === 0);
  var off = await runGate(withStatus('suspended', { packaged: true }), USER, { fetch: served(403, { error: 'Active organization membership required' }) });
  ok('gate: a suspended packaged workspace is not active, not a connection problem', /not active/.test(off.html) && !/omega-gate-retry/.test(off.html) && !/could not/i.test(off.html), off.html.slice(0, 120));
  var disabled = await runGate(org({ packaged: true }), USER, { fetch: served(403, { error: 'Active organization membership required' }) });
  ok('gate: a 403 from the package check is a refusal: no Retry, no "could not check"', !disabled.allowed && !/omega-gate-retry/.test(disabled.html) && !/could not/i.test(disabled.html), disabled.html.slice(0, 160));
  ok('gate: it says why in the server\'s words, and who can change it', /Active organization membership required\./.test(disabled.html) && /owner or administrator/.test(disabled.html) && !/See modules/.test(disabled.html));
  var real = X.project.bind(X);
  var viaServer = function (member, caller) { return function () { try { return served(200, real(caller || { emailVerified: true }, { packaged: true, packagingState: 'paid', accessUntil: NOW + DAY, modules: ['lite'] }, { status: 'active' }, member, NOW))(); } catch (e) { return served(e.status || 503, { error: e.message })(); } }; };
  var roleless = await runGate(org({ packaged: true }), USER, { fetch: viaServer({ role: 'guest', status: 'active' }) });
  ok('gate: the real projection\'s refusal for a member without a role reads as a refusal', /Workspace role required/.test(roleless.html) && !/omega-gate-retry/.test(roleless.html), roleless.html.slice(0, 160));
  var unverified = await runGate(org({ packaged: true }), USER, { fetch: viaServer({ role: 'owner', status: 'active' }, { emailVerified: false }) });
  ok('gate: and for an unverified email, which is told to verify it, not to ask an administrator', /Verify your email address/.test(unverified.html) && !/owner or administrator/.test(unverified.html) && !/omega-gate-retry/.test(unverified.html));
  var member = await runGate(org({ packaged: true }), USER, { fetch: viaServer({ role: 'member', status: 'active' }) });
  ok('gate: an active member of a live package gets in', member.allowed);
  var outage = await runGate(org({ packaged: true }), USER, { fetch: served(503, { error: 'Package access is unavailable' }) });
  ok('gate: a 503 is still a check that could not run, with Retry', /Package access could not be checked/.test(outage.html) && /omega-gate-retry/.test(outage.html));
  var expired = await runGate(org({ packaged: true }), USER, { fetch: served(401, { error: 'token has expired' }) });
  ok('gate: so is a 401 (a fresh token may answer)', /omega-gate-retry/.test(expired.html));
}

/* ── 5 · editor.html ─────────────────────────────────────────────────── */
var ed = fs.readFileSync(path.join(ROOT, 'editor.html'), 'utf8'), planSrc = fs.readFileSync(path.join(ROOT, 'omega-editor-plan.js'), 'utf8');
var nav = ed.slice(ed.indexOf('<div id="portal-nav">'), ed.indexOf('<!-- ============ TIER 1'));
ok('the chip mounts in the title bar', /<span id="omega-plan" hidden><\/span>/.test(nav));
ok('the editor loads the plan chip after the one menu and OmegaCaps', ed.indexOf('src="/omega-editor-plan.js"') > ed.indexOf('src="/omega-package-menu.js"') && ed.indexOf('src="/omega-package-menu.js"') > ed.indexOf('src="/omega-caps.js"'));
ok('the editor still never loads omega-tenant.js', !/src="\/?omega-tenant\.js/.test(ed) && !/script\('\/omega-tenant/.test(planSrc));
ok('the gate announces who it let in, and the chip re-checks an unchecked plan on it (review #21; render-editor-plan.js drives it)',
  /dispatchEvent\(new CustomEvent\('omega:editor-access'/.test(gateSrc) && /addEventListener\('omega:editor-access'/.test(planSrc));
ok('the chip carries no ribbon-command marks, so OmegaCaps never hides it', !/data-module|data-cap|\brbtn\b|rsbtn/.test(planSrc.replace(/data-plan-module/g, '')));
ok('nothing is priced here: no arithmetic on money, only server strings', !/toFixed|priceCents|\* 100\b|\/ 100\b/.test(planSrc));
ok('the new file carries the header', /© 2025–2026 ClearSky Energy Solutions LLC\. Proprietary and Confidential\./.test(planSrc));

capsChecks().then(gateChecks).then(function () {
  console.log('teditorplan: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}, function (e) { console.error(e); process.exit(1); });
