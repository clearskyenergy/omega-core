/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   omega-workspace-hub.js — what the Omega Workspace hex hub is made of.

   The hub (omega-hexhub.js) is seven cells: Today in the middle and six
   around it. Which six is decided HERE, once, from what the workspace may
   actually open — never from a list a page keeps for itself. An AREA is a
   named group of tools (Design is Site Map and the sandbox; Money is the
   sizers and pro formas; Orders, Plant and Deliver are Omega Logic's parts).
   An area earns a cell when at least one of its tools is open to this
   person, judged by the SAME OMEGATools.isUnlocked() that locks a tile, so
   the hub can never show a door the tile grid would lock.

     OmegaWorkspaceHub.compose(ctx)  → { centre, ring: [area × ≤6] }
     OmegaWorkspaceHub.items(key, ctx) → the area's entries for the side panel
     OmegaWorkspaceHub.AREAS          → the table, for the test

   and what a workspace holds of each module, the ONE rule every surface
   asks (the Modules page, Plan & billing, the marketplace, the editor's
   plan chip, the admin Package tab, the server's add-on check):
     moduleState / moduleTools / moduleEditor / moduleNote   the judgement
     moduleCard                     one card, one status, at most one action
     editorCtx / capsFor / legacyCtx  the editor's tier for a legacy plan

   ctx = { canOpen(toolKey) → bool, tool(toolKey) → catalog entry | null,
           modules[] (a packaged workspace's), addons[] (a legacy one's),
           addOns[] (the modules a legacy one bought as add-ons and has on
           now: billing.addOns.live, api/_lib/addons.js), hideMarketplace,
           and for a legacy plan canCap / ungated / visible (legacyCtx) }

   Showing a cell is never access: every tool page and endpoint still checks.
   Projects and Team are always in the ring (a workspace with no projects
   still has a Projects page); the rest fill the remaining four by priority,
   Omega Logic's areas first because a workspace that runs a plant lives in
   it. ES5, no dependencies, exported for Node so scripts/tests/tworkspacehub.js
   can assert every key it names against the real catalog. */
(function (root) {
  'use strict';
  var AREAS = [
    { key: 'today',    label: 'Today',    icon: '◷', hint: 'what needs you', centre: true },
    { key: 'projects', label: 'Projects', icon: '▥', hint: 'all sites', always: true, href: '/projects.html', pages: [['In flight', 'Every project and how far along it is', '#flight'], ['All projects', 'Every site, who has it, where it is', '/projects.html']] },
    { key: 'orders',   label: 'Orders',   icon: '◷', hint: 'office', logic: 'logic-office',    pages: [['Orders', 'Price, accept, invoice', '/omega-logic#orders'], ['Customers', 'Accounts and people', '/portals/customer/admin.html'], ['Office app', 'On a phone', '/office/app']] },
    { key: 'plant',    label: 'Plant',    icon: '⚙', hint: 'build',  logic: 'logic-plant',     pages: [['Work order board', 'What to build', '/plant/work-orders.html'], ['Plant board', 'Live station map', '/plant/manager.html'], ['Plant app', 'The bench', '/plant/app']] },
    { key: 'deliver',  label: 'Deliver',  icon: '➜', hint: 'ship, custody', logic: 'logic-logistics', pages: [['Shipping & receiving', 'Loads and lanes', '/logic-logistics.html'], ['Sites & custody', 'Where every unit is', '/logic-custody.html']] },
    { key: 'design',   label: 'Design',   icon: '▧', hint: 'Site Map, sandbox', tools: ['editor', 'sandbox', 'siteoptimizer', 'powerflow', 'sitediscovery', 'conductorsizing'] },
    { key: 'grid',     label: 'Grid',     icon: '⌗', hint: 'capacity, screen', tools: ['gridatlas', 'interconnect', 'comedcap', 'sitefinder', 'interconnectstudy'] },
    { key: 'money',    label: 'Finance',  icon: '$',      hint: 'size, revenue, model', tools: ['batterysizer', 'valuestack', 'vppsim', 'computeproforma', 'isocalc', 'proforma', 'dcfc', 'apartment', 'fleet', 'investment', 'costestimator'] },
    { key: 'sales',    label: 'Sales',    icon: '▤', hint: 'screen, propose, estimate', tools: ['sales', 'spatco_ev', 'evcostwb', 'computelease', 'parcelscreening', 'bessscreening'], subjects: [{ key: 'screening', name: 'Screening', sub: 'Parcel and BESS portfolio screening', href: '/screening.html', tools: ['parcelscreening', 'bessscreening'] }] },
    { key: 'market',   label: 'Market',   icon: '◈', hint: 'partners, quotes', market: true, tools: ['financing', 'opportunity', 'osaportal'], pages: [['Marketplace', 'The tools catalogue: BESS, EV and finance tools', '/marketplace.html'], ['Quote Desk', 'Both ends of a request for quote', '/rfq.html']] },
    { key: 'compute',  label: 'Compute',  icon: '▦', hint: 'data centers, edge sites', tools: ['datacenter', 'computepower', 'computeproforma'] },
    { key: 'permits',  label: 'Permits',  icon: '✓', hint: 'AHJ, intake', tools: ['permit', 'intake', 'sitelifecycle'] },
    { key: 'ops',      label: 'Operate',  icon: '◉', hint: 'O&M, fleet', tools: ['signal', 'omconsole', 'fieldservice', 'slaintel', 'ownerreport', 'fleetcommand', 'degradation', 'evcloseout'] },
    { key: 'team',     label: 'Team',     icon: '◌', hint: 'people, feed', always: true, pages: [['Team', 'Who is in the workspace', '#team'], ['Feed', 'What changed', '#feed']] }
  ];
  var RING_MAX = 6;
  function byKey(key) { for (var i = 0; i < AREAS.length; i++) if (AREAS[i].key === key) return AREAS[i]; return null; }
  function has(list, k) { return Array.isArray(list) && list.indexOf(k) >= 0; }
  /* does this workspace hold an Omega Logic part: a packaged one by module,
     a legacy one by the omega-logic add-on (which holds every part) or by
     the part bought as an add-on to its plan */
  function holdsLogic(ctx, part) { ctx = ctx || {}; return has(ctx.modules, part) || has(ctx.addons, 'omega-logic') || has(ctx.addOns, part); }
  function openTools(area, ctx) {
    var out = [];
    (area.tools || []).forEach(function (k) { if (ctx.canOpen && ctx.canOpen(k)) out.push(k); });
    return out;
  }
  function earns(area, ctx) {
    if (area.centre) return false;
    if (area.always) return true;
    if (area.logic) return holdsLogic(ctx, area.logic);
    if (area.market && ctx.hideMarketplace) return openTools(area, ctx).length > 0;
    if (area.market) return true;
    return openTools(area, ctx).length > 0;
  }
  function compose(ctx) {
    ctx = ctx || {};
    var ring = [], fill = [];
    AREAS.forEach(function (a) { if (a.centre || !earns(a, ctx)) return; (a.always ? ring : fill).push(a); });
    /* Projects first, Team last, the rest by priority in between */
    var first = ring.filter(function (a) { return a.key === 'projects'; }), last = ring.filter(function (a) { return a.key !== 'projects'; });
    var room = RING_MAX - first.length - last.length;
    return { centre: byKey('today'), ring: first.concat(fill.slice(0, Math.max(0, room)), last).slice(0, RING_MAX) };
  }
  /* the side panel's rows for an area: pages first, then its tools with
     the catalog's own name and link, locked ones last and marked */
  function items(key, ctx) {
    var a = byKey(key); if (!a) return [];
    ctx = ctx || {};
    var out = (a.pages || []).map(function (p) { return { name: p[0], sub: p[1], href: p[2], page: true }; });
    var grouped = [];
    (a.subjects || []).forEach(function (s) {
      grouped = grouped.concat(s.tools || []);
      out.push({ key: s.key, name: s.name, sub: s.sub, href: s.href, page: true, subject: true });
    });
    var open = [], locked = [];
    (a.tools || []).forEach(function (k) {
      if (grouped.indexOf(k) >= 0) return;
      var t = ctx.tool ? ctx.tool(k) : null; if (!t || t.soon) return;
      var row = { key: k, name: t.name, sub: t.blurb || t.desc || '', locked: !(ctx.canOpen && ctx.canOpen(k)) };
      (row.locked ? locked : open).push(row);
    });
    return out.concat(open, locked);
  }
  /* ── DOES THIS WORKSPACE HOLD A MODULE? One rule for the Modules page,
     the marketplace store and the master console (Tommy, 2026-09-27: every
     module listed, marked by whether it is used or given). ctx as compose()
     takes it, plus packaged (bool), tierLevel (the legacy tier), canCap
     (a legacy cap → bool, from capsFor(): the SAME ladder the editor
     applies) and editorModules (add-ons whose own commands the editor
     opens, whatever gates their tab: what api/_lib/addons.js exact()
     simulates a purchase with).
       packaged   held when the server's projection lists it, else open
       legacy     bought as an add-on and on now (ctx.addOns): held;
                  an Omega Logic part: held by the omega-logic add-on;
                  any other module is measured on BOTH halves of what it
                  is: its standalone tools (ctx.canOpen: the tier, the
                  allowlist, the overrides) and its commands in the editor
                  (catalog legacyGates, each gate asked of ctx.canCap).
                  Held when every part is open, part when some are, else
                  ask. A module with neither (the storefront) is held on
                  Enterprise.
     "Store tells the truth" (Tommy, 2026-09-27): a Performance tenant who
     produces plot plans in the editor holds Plan Sets, and a Core tenant
     whose Analyze tab is closed does not hold Storage just because the
     Battery Sizer page opens. Answers 'held' | 'part' | 'ask' | 'open'.
     Showing a state is never access: the tools and the editor check the
     same plan. The server asks this same rule before it sells an add-on
     (api/_lib/addons.js held()), and an add-on's grants open both halves. */
  function moduleTools(m, ctx) {
    ctx = ctx || {};
    var total = 0, open = 0;
    ((m && m.tools) || []).forEach(function (k) {
      if (ctx.tool && !ctx.tool(k)) return;
      /* a tool this org can never see (another org's, ClearSky's own) is
         not part of what it can hold, so it never keeps a module "partly" */
      if (ctx.visible && !ctx.visible(k)) return;
      total++; if (ctx.canOpen && ctx.canOpen(k)) open++;
    });
    return { open: open, total: total };
  }
  /* The editor's half of a legacy module: its commands in Site Map, each
     behind the legacy data-cap recorded in the catalog (legacyGates, read
     off the real editor by scripts/render-legacy-gates.js), asked of
     ctx.canCap — the editor's own ladder for this plan (editorCtx). '' is a
     command no plan gates. */
  function moduleEditor(m, ctx) {
    ctx = ctx || {};
    var gates = (m && m.legacyGates) || [], open = 0;
    /* canCap is the judge; a caller still handing only editorCan (true /
       false for a cap the ladder governs) is read the same way */
    var can = typeof ctx.canCap === 'function' ? ctx.canCap : typeof ctx.editorCan === 'function' ? function (c) { return ctx.editorCan(c) === true; } : null;
    if (!gates.length || !can) return { open: 0, total: 0 };
    /* the editor is a tool too: an allowlist without it opens none of them */
    var editor = !ctx.tool || !ctx.tool('editor') || !ctx.canOpen || ctx.canOpen('editor');
    /* an add-on the plan has on (ctx.editorModules): the editor opens
       exactly its own commands, whatever gates the tab they sit on
       (omega-caps, by the catalog's ribbon) */
    if (editor && has(ctx.editorModules, m.key)) return { open: gates.length, total: gates.length };
    /* a gate may be a chain ("engineering+parcelscreen": a command with its
       own cap on a gated tab); every link must be open */
    if (editor) gates.forEach(function (g) { if (!g || String(g).split('+').every(function (c) { return can(c); })) open++; });
    return { open: open, total: gates.length };
  }
  function moduleState(m, ctx) {
    ctx = ctx || {}; if (!m) return 'ask';
    if (ctx.packaged) return has(ctx.modules, m.key) ? 'held' : 'open';
    /* Lite (Omega Design) is the floor every plan stands on: always held,
       even where a few of its drawing controls sit on a tab the tier keeps
       closed (moduleEditor still counts them) */
    if (m.key === 'lite') return 'held';
    if (has(ctx.addOns, m.key)) return 'held';
    if (/^logic-/.test(m.key)) return holdsLogic(ctx, m.key) ? 'held' : 'ask';
    /* the storefront opens nothing in the editor and has no tools: it is on
       exactly where the public storefront's own gate opens it (a staff flag
       on the tenant record or the add-on, never the tier), so the page hands
       over the billing record and the tenant's whiteLabel block */
    if (m.key === 'whitelabel' && ctx.billing !== undefined) return storefront(ctx.billing, ctx.whiteLabel) ? 'held' : 'ask';
    var t = moduleTools(m, ctx), e = moduleEditor(m, ctx), total = t.total + e.total, open = t.open + e.open;
    /* nothing to measure: held where the plan opens
       everything, asked of the editor's own tier when the page has it (a
       trial's tool level is Enterprise's, but its plan is not), else by the
       tool level */
    if (!total) return (typeof ctx.ungated === 'boolean' ? ctx.ungated : typeof ctx.canCap === 'function' ? ctx.canCap('all') === true : ctx.tierLevel >= 3) ? 'held' : 'ask';
    return open === total ? 'held' : open ? 'part' : 'ask';
  }
  /* Whether the public storefront is on for a legacy workspace: the twin of
     api/_lib/storefront.js storefrontEntitled (a toolOverrides switch either way,
     else the 'whitelabel' add-on or whiteLabel.enabled on the tenant record;
     never the tier). scripts/tests/tworkspacehub.js runs both over every case. */
  function storefront(billing, whiteLabel) {
    var b = billing || {}, overrides = b.toolOverrides || {}, addons = b.addons || [], wl = whiteLabel || {};
    return overrides.whitelabel === true
      || (overrides.whitelabel !== false
          && (addons.indexOf('whitelabel') >= 0 || wl.enabled === true));
  }
  /* What "Partly" means, in one line, from the same two halves moduleState
     weighs: never "4 of 4 of its tools" under a Partly badge because the
     missing half is in the editor. */
  function moduleNote(m, ctx) {
    var t = moduleTools(m, ctx), e = moduleEditor(m, ctx), bits = [];
    if (t.total) bits.push(t.open + ' of ' + t.total + ' of its tools');
    if (e.total) bits.push(e.open === e.total ? 'all of its commands in Site Map' : e.open ? 'some of its commands in Site Map' : 'none of its commands in Site Map');
    return bits.length ? bits.join(' and ') + (bits.length > 1 || t.open !== 1 || !t.total ? ' are' : ' is') + ' on your plan' : '';
  }
  /* ── THE SITE MAP HALF OF THE LEGACY RULE, once (the Modules page, the
     marketplace, the editor's plan chip, the admin Package tab and the
     server's add-on check all ask it): which tier Site Map runs for this
     billing record and person, and what that tier opens. It mirrors
     OmegaCaps.read() for a legacy record exactly: the record wins, a
     missing tier is 'trial', capTier caps it, the JV carve-out follows the
     org, add-ons only widen; a verified ClearSky address with NO record
     runs 'internal'. PURE: it asks caps.canWith and never sets the
     library's own state (the editor page's resolved plan, and a long-lived
     server process, must not have theirs rewritten).
       caps     OmegaCaps (window.OmegaCaps, or require('omega-caps.js')
                .OmegaCaps in Node)
       billing  billing/current, or null / undefined when there is NO
                record (distinct from {})
       who      { email, emailVerified, orgId } — the person the editor
                resolves for; staff and the server judging a tenant pass
                the tenant's orgId and no email
     Answers { tier, ungated, canCap(cap), editorCan(cap) } to merge into a
     ctx, or null when the library is absent (then the tools are measured
     alone). editorCan is canCap for a capability the ladder governs and
     null for any other word. ── */
  function editorCtx(caps, billing, who) {
    if (!caps || typeof caps.canWith !== 'function' || typeof caps.effectiveTier !== 'function') return null;
    who = who || {};
    var orgOf = typeof caps.orgOf === 'function' ? caps.orgOf : function (e) { return String(e || '').toLowerCase().split('@')[1] || ''; };
    var org = String(who.orgId || '').toLowerCase() || orgOf(who.email), own = who.email ? orgOf(who.email) : '';
    var internal = !billing && (caps.INTERNAL_DOMAINS || []).indexOf(org) >= 0 && (!who.email || (who.emailVerified === true && own === org));
    var bl = billing || {}, tier, addons = Array.isArray(bl.addons) ? bl.addons.slice() : [];
    try { tier = internal ? 'internal' : caps.effectiveTier(bl.tier || 'trial', bl.capTier); } catch (e) { return null; }
    function canCap(cap) { return caps.canWith(tier, cap, { addons: addons, org: org }) === true; }
    function editorCan(cap) { return typeof caps.governs === 'function' && !caps.governs(cap) ? null : canCap(cap); }
    return { tier: tier, ungated: canCap('all'), canCap: canCap, editorCan: editorCan };
  }
  /* ctx.canCap for a legacy WORKSPACE with no person (the server's add-on
     check, the master console): editorCtx for its org. ClearSky's own
     workspace with no tier on record reads as the editor opens it
     (internal); the server hands {} for a record that does not exist. Null
     when there is no OmegaCaps, and moduleState then measures the tools
     alone. */
  function workspaceRecord(billing, org, caps) {
    return (!billing || !billing.tier) && caps && (caps.INTERNAL_DOMAINS || []).indexOf(org) >= 0 ? null : (billing || {});
  }
  function capsFor(billing, org, caps) {
    caps = caps || (root && root.OmegaCaps);
    var o = String(org || '').toLowerCase();
    var e = editorCtx(caps, workspaceRecord(billing, o, caps), { orgId: o });
    return e ? e.canCap : null;
  }
  /* ── A LEGACY WORKSPACE'S ctx, built once for every surface that judges
     one (the Modules page, the marketplace, the editor's plan chip, the
     admin Package tab, the server's add-on check): its tools asked of the
     catalog's own isUnlocked / isVisible, the modules it bought by card and
     has on now, and the editor's half from editorCtx.
       o = { tools (OMEGATools), ws (the entitlement object: orgId,
             tierLevel, addons, toolAccess, toolOverrides, unlockedTools,
             requiredTools, addOns?), billing (billing/current | null),
             caps (OmegaCaps), who ({ email, emailVerified, orgId }),
             canOpen? (a page's own rule, e.g. nothing while pending),
             addOns? (override), now? }
     Nothing here is access: every page and endpoint still checks. ── */
  function liveAddOns(billing, now) {
    var a = billing && billing.addOns;
    if (!a || !Array.isArray(a.live) || !a.live.length) return [];
    var until = typeof a.accessUntil === 'number' ? a.accessUntil : Date.parse(a.accessUntil);
    return isFinite(until) && (now == null ? Date.now() : now) < until ? a.live.slice() : [];
  }
  function legacyCtx(o) {
    o = o || {};
    var T = o.tools || null, ws = o.ws || {}, bl = o.billing || null;
    function tool(k) { return T && T.byKey ? T.byKey(k) || null : null; }
    var who = o.who || {};
    if (!who.orgId && ws.orgId) who = { email: who.email, emailVerified: who.emailVerified, orgId: ws.orgId };
    var c = { packaged: false, modules: [], addons: ws.addons || (bl && bl.addons) || [], tierLevel: ws.tierLevel, hideMarketplace: !!ws.hideMarketplace,
      addOns: o.addOns || ws.addOns || liveAddOns(bl, o.now),
      /* the storefront is on where its own gate opens it (moduleState asks
         storefront() with these): the record's switch or add-on, or the
         tenant record's staff-written whiteLabel, never the tier */
      billing: bl, whiteLabel: o.whiteLabel || ws.whiteLabel || null,
      tool: tool,
      canOpen: o.canOpen || function (k) { var t = tool(k); return !!t && !!T.isUnlocked && T.isUnlocked(t, ws); },
      visible: function (k) { var t = tool(k); return !!t && (!T.isVisible || T.isVisible(t, ws)); } };
    /* a workspace judged with no person (the server's add-on check, the
       master console) reads its record as capsFor does; a person's page
       reads it as the editor resolves for that person */
    var caps = o.caps || (root && root.OmegaCaps);
    var e = editorCtx(caps, who.email ? bl : workspaceRecord(bl, String(who.orgId || '').toLowerCase(), caps), who);
    if (e) { c.canCap = e.canCap; c.editorCan = e.editorCan; c.ungated = e.ungated; c.editorTier = e.tier; }
    return c;
  }
  /* ── ONE CARD, ONE STATUS, AT MOST ONE ACTION (Tommy, 2026-09-27: "the
     opt in and opt out stuff you need to make that make sense"). Every
     surface that shows a module to a workspace — the Modules page, Plan &
     billing's chips and changes in progress — reads its card here, so a
     module can never say Live in one place and Opt in in another.
       m        the catalog entry (key, name, shelf, tools, legacyGates)
       ctx      as moduleState takes it
       billing  billing/current as the workspace reads it: subscription,
                optIns{}, optOuts{}, removalRequests[], paymentLink, and a
                legacy plan's card-bought add-ons (addOns: modules, live,
                pending[], ending{}, nextInvoiceOn: api/_lib/addons.js)
       summary  GET /api/plan-change, or null while it loads or failed:
                pending[], gate{canApply, reason}, nextReviewOn, addOns; its
                subscription, removalRequests, optIns, optOuts and addOns
                stand in only where billing/current carries none
       opts     { admin, pendingApproval, planName, company, price }
     The card carries the record its state rests on (record: the change
     invoice, the add-on invoice, the queued removal, the opt-out or the
     opt-in), so Plan & billing lists what is in flight FROM the cards: a
     request the plan has already answered (an opt-in on a module now held,
     an opt-out on one no longer held) is never shown as in flight anywhere.
     A state, first match wins:
       included  Lite (Omega Design), the floor every plan stands on
       awaiting  a change invoice for it is open (packaged), or the add-on
                 invoice that buys it is (legacy, bought by card)
       bought    in the subscription, not switched on yet (packaged)
       removing  an opt-out is queued (packaged: for the review; legacy:
                 with ClearSky; a card-bought add-on: at the end of the
                 month paid for)
       live      on the plan (a legacy add-on's renewal waiting for payment
                 says so and pays)
       requested an opt-in is recorded, waiting on ClearSky (legacy)
       part      some of it is on the plan (legacy)
       available not on the plan
     The words are the contract's: Opt in, Opt out, Cancel request; never
     Subscribe or Ask. The action is what the button does; the ONE menu
     (omega-package-menu.js) confirms it and states the money before
     anything is written (for a legacy plan it asks the server first
     whether the module can be bought by card now, or is a recorded
     request). Nothing here prices: the price is the server's display
     string, handed in, shown once on the card. card.via says whose path a
     change takes: 'package' (the engine), 'addon' (a legacy plan's card
     add-on) or 'request' (a legacy plan's recorded request). */
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  /* a calendar day as people read it; 'YYYY-MM-DD' is that day wherever
     the reader is (new Date('2026-12-20') is the 19th in Chicago) */
  function shortDay(v) {
    if (!v) return '';
    var s = String(v), d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (d) return MON[+d[2] - 1] + ' ' + (+d[3]);
    var t = new Date(typeof v === 'number' ? v : s);
    return isNaN(t.getTime()) ? '' : MON[t.getMonth()] + ' ' + t.getDate();
  }
  function listed(obj, key) { var o = obj && typeof obj === 'object' ? obj[key] : null; return o && o.status === 'requested' ? o : null; }
  function cap1(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); }
  /* a legacy plan's card add-ons (api/_lib/addons.js): the stored record
     (billing/current.addOns) or the summary's view of it. `ending` is a map
     of stop requests on the record and a list in the view. */
  function addOnPending(ao, key, purpose) {
    var list = ao && Array.isArray(ao.pending) ? ao.pending : [];
    for (var i = 0; i < list.length; i++) { var p = list[i]; if (p && (p.purpose || 'purchase') === purpose && has(p.add, key)) return p; }
    return null;
  }
  function addOnEnding(ao, key) {
    var e = ao && ao.ending;
    if (!e) return null;
    if (Array.isArray(e)) { for (var i = 0; i < e.length; i++) if (e[i] && e[i].key === key) return e[i]; return null; }
    return e[key] && e[key].status === 'requested' ? e[key] : null;
  }
  function moduleCard(m, ctx, billing, summary, opts) {
    ctx = ctx || {}; billing = billing || {}; opts = opts || {};
    var key = m && m.key, packaged = !!ctx.packaged, price = opts.price || '', plan = opts.planName || 'your plan', co = opts.company || 'your workspace';
    var card = { key: key, state: 'available', pill: 'Not on your plan', tone: 'off', held: false, priceLine: price, note: '', action: null, secondary: null, adminLine: '', record: null, via: packaged ? 'package' : 'request' };
    var st = moduleState(m, ctx), sm = summary || {};
    var sub = billing.subscription && Array.isArray(billing.subscription.modules) ? billing.subscription.modules : Array.isArray(sm.subscription) ? sm.subscription : [];
    var wait = null;
    (sm.pending || []).forEach(function (p) { if (!wait && Array.isArray(p.add) && p.add.indexOf(key) >= 0) wait = p; });
    var queued = null;
    (Array.isArray(billing.removalRequests) ? billing.removalRequests : Array.isArray(sm.removalRequests) ? sm.removalRequests : []).forEach(function (r) { if (r && r.module === key) queued = r; });
    var optOut = !packaged ? listed(billing.optOuts || sm.optOuts, key) : null, optIn = !packaged ? listed(billing.optIns || sm.optIns, key) : null;
    /* a legacy plan's card add-ons: what waits for payment, what is on, what is stopping */
    var ao = packaged ? null : (billing.addOns && typeof billing.addOns === 'object' ? billing.addOns : sm.addOns && typeof sm.addOns === 'object' ? sm.addOns : null);
    var aoLive = !packaged && (has(ctx.addOns, key) || (!ctx.addOns && ao && has(ao.live, key))) && st === 'held';
    var aoBuy = ao && !aoLive && st !== 'held' ? addOnPending(ao, key, 'purchase') : null;
    var aoRenew = aoLive ? addOnPending(ao, key, 'renewal') : null;
    var aoEnd = aoLive ? addOnEnding(ao, key) : null;
    function payAction(p) { return p.paymentLink ? { kind: 'pay', label: 'Pay' + (p.display ? ' ' + p.display : ''), href: p.paymentLink, payWith: p.payWith || 'QuickBooks' } : { kind: 'billing', label: 'Plan & billing' }; }
    if (key === 'lite') {
      card.state = 'included'; card.pill = 'Live · always included'; card.tone = 'live'; card.held = true;
      card.priceLine = 'In every plan'; card.note = 'Always on. Nothing to opt in to or out of.';
      return card;
    }
    if (packaged && wait) {
      card.state = 'awaiting'; card.pill = 'Waiting for payment'; card.tone = 'wait';
      /* the server expires an unpaid change at its cycle end: said as such, the same words as the menu */
      card.note = (wait.display ? wait.display + ' invoice · ' : '') + 'switches on when paid' + (wait.expiresOn ? ' · expires unpaid on ' + shortDay(wait.expiresOn) : '');
      card.action = wait.paymentLink ? { kind: 'pay', label: 'Pay' + (wait.display ? ' ' + wait.display : ''), href: wait.paymentLink, payWith: wait.payWith || sm.payWith || '' } : { kind: 'billing', label: 'Plan & billing' };
      card.secondary = { kind: 'cancel', label: 'Cancel request' }; card.record = wait;
    } else if (aoBuy) {
      /* bought by card on a legacy plan, its QuickBooks invoice still open */
      card.state = 'awaiting'; card.pill = 'Waiting for payment'; card.tone = 'wait'; card.via = 'addon';
      card.note = (aoBuy.display ? aoBuy.display + ' invoice · ' : '') + 'switches on when paid' + (aoBuy.expiresOn ? ' · expires unpaid on ' + shortDay(aoBuy.expiresOn) : '');
      card.action = payAction(aoBuy);
      card.secondary = { kind: 'cancel', label: 'Cancel request', via: 'addon', addOnId: aoBuy.id };
      card.record = { kind: 'addon', id: aoBuy.id, purpose: 'purchase', add: aoBuy.add, names: aoBuy.names, display: aoBuy.display, paymentLink: aoBuy.paymentLink, payWith: aoBuy.payWith || 'QuickBooks', expiresOn: aoBuy.expiresOn, date: aoBuy.date };
    } else if (aoRenew && !aoEnd) {
      /* on now; the month's renewal waits for payment (no opt-out until it is paid) */
      card.state = 'live'; card.pill = 'Waiting for payment'; card.tone = 'wait'; card.held = true; card.via = 'addon';
      card.note = (aoRenew.display ? aoRenew.display + ' renewal' : 'The renewal') + ' is waiting for payment. It stays on while the invoice is open.';
      card.action = payAction(aoRenew);
      card.record = { kind: 'addon', id: aoRenew.id, purpose: 'renewal', add: aoRenew.add, names: aoRenew.names, display: aoRenew.display, paymentLink: aoRenew.paymentLink, payWith: aoRenew.payWith || 'QuickBooks', date: aoRenew.date };
    } else if (packaged && st !== 'held' && sub.indexOf(key) >= 0) {
      card.state = 'bought'; card.pill = 'Bought · not on yet'; card.tone = 'wait';
      card.note = 'Switches on when your open invoice is paid.';
      card.action = billing.paymentLink ? { kind: 'pay', label: 'Pay now', href: billing.paymentLink, payWith: sm.payWith || '' } : { kind: 'billing', label: 'Plan & billing' };
    } else if (aoEnd) {
      /* a card add-on stopping: on until the month paid for ends, never renewed */
      var ends = aoEnd.endsOn || (ao && ao.nextInvoiceOn) || '';
      card.state = 'removing'; card.pill = 'Opting out'; card.tone = 'wait'; card.held = true; card.via = 'addon';
      card.priceLine = price || 'Add-on';
      card.note = 'Stays on until ' + (ends ? shortDay(ends) : 'the end of the month you paid for') + (ends ? ', the end of the month you paid for,' : '') + ' and is not renewed.';
      card.action = { kind: 'cancel', label: 'Cancel request', via: 'addon-stop' };
      card.record = { kind: 'addon-stop', key: key, endsOn: ends || null, requestedAt: aoEnd.requestedAt || null };
    } else if ((packaged && queued && st === 'held') || (optOut && (st === 'held' || st === 'part'))) {
      card.state = 'removing'; card.pill = 'Opting out'; card.tone = 'wait'; card.held = true;
      var review = (queued && queued.reviewOn) || (summary && summary.nextReviewOn) || null;
      card.note = packaged
        ? 'Stays on, and billed, until ' + (review ? 'your review on ' + shortDay(review) : 'your next quarterly review') + '.'
        : 'Requested ' + shortDay(optOut.requestedAt) + '. ClearSky confirms the date and any price change in writing; access is unchanged until then.';
      card.action = { kind: 'cancel', label: 'Cancel request' }; card.record = packaged ? queued : optOut;
    } else if (st === 'held') {
      /* the money column carries the bare price, as every other card does
         (with the words beside it, a long name and a four-figure price ran
         past the card's edge on a phone); the note says where it is billed */
      card.state = 'live'; card.pill = 'Live'; card.tone = 'live'; card.held = true;
      if (aoLive) {
        card.via = 'addon'; card.priceLine = price || 'Add-on';
        card.note = 'Add-on · paid by card' + (ao && ao.nextInvoiceOn ? ', renews on ' + shortDay(ao.nextInvoiceOn) : '') + '.';
        card.action = { kind: 'remove', label: 'Opt out', via: 'addon' };
      } else {
        card.priceLine = packaged ? (price || 'In your plan') : 'Included in ' + plan;
        card.note = packaged && price ? 'On your plan · in your monthly fee.' : 'On your plan.';
        card.action = { kind: 'remove', label: 'Opt out' };
      }
    } else if (optIn) {
      card.state = 'requested'; card.pill = 'Opt-in requested'; card.tone = 'wait';
      card.priceLine = optIn.display || price;
      card.note = 'Requested ' + shortDay(optIn.requestedAt) + (optIn.display || price ? ' at ' + (optIn.display || price) : '') + '. It joins your monthly invoice once ClearSky moves you to monthly billing; nothing is charged before you approve that invoice.';
      card.action = { kind: 'cancel', label: 'Cancel request' }; card.record = optIn;
    } else if (st === 'part') {
      /* moduleNote is the ONE "Partly" sentence: both halves, tools and Site Map */
      var said = moduleNote(m, ctx);
      card.state = 'part'; card.pill = 'Partly included'; card.tone = 'part';
      card.note = (said ? cap1(said) + '. ' : 'Part of it is in ' + plan + '. ') + 'Opting in adds the rest' + (price ? ' for ' + price : '') + '.';
      card.action = { kind: 'add', label: 'Opt in' };
    } else {
      var gate = summary && summary.gate;
      /* a legacy plan: Opt in asks the server first whether the module can
         be bought by card now or goes to ClearSky as a request, and the
         menu says which before anything is sent */
      card.note = packaged
        ? (gate && gate.canApply === false && gate.reason ? gate.reason : 'Prorated today, then ' + (price || 'its monthly price') + '.')
        : 'Adds ' + (price || 'its monthly price') + '. Opting in shows how it is billed before anything is charged.';
      card.action = { kind: 'add', label: 'Opt in' };
      if (packaged && gate && gate.canApply === false) card.action.disabled = true;
    }
    /* who may press it: a workspace waiting on approval changes nothing yet,
       a module on its plan included (an opt-out filed before approval would
       mail ClearSky a request about a plan it has not approved); anyone but
       an owner or administrator reads the card and is told who changes it
       (the server refuses them too), and may still pay an open invoice */
    if (opts.pendingApproval) { card.note = card.held ? 'On your plan. It opens when ClearSky approves ' + co + '.' : 'Opens when ClearSky approves ' + co + '.'; card.action = null; card.secondary = null; }
    else if (opts.admin === false && card.action && card.action.kind !== 'billing') { card.action = card.action.kind === 'pay' ? card.action : null; card.secondary = null; card.adminLine = 'An owner or administrator of ' + co + ' changes modules.'; }
    return card;
  }
  var API = { AREAS: AREAS, compose: compose, items: items, moduleState: moduleState, moduleTools: moduleTools, moduleEditor: moduleEditor, moduleNote: moduleNote, moduleCard: moduleCard,
    editorCtx: editorCtx, capsFor: capsFor, legacyCtx: legacyCtx, liveAddOns: liveAddOns, storefront: storefront, holdsLogic: holdsLogic, shortDay: shortDay, RING_MAX: RING_MAX };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (root) root.OmegaWorkspaceHub = API;
})(typeof window !== 'undefined' ? window : null);
