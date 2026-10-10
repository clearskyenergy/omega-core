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
    { key: 'projects', label: 'Projects', icon: '▥', hint: 'all sites', always: true, href: '/projects.html', pages: [['Portfolio', 'Your sites, energy assets and opportunities', '/portfolio.html'], ['In flight', 'Every project and how far along it is', '#flight'], ['All projects', 'Every site, who has it, where it is', '/projects.html']] },
    { key: 'orders',   label: 'Orders',   icon: '◷', hint: 'office', logic: 'logic-office',    pages: [['Orders', 'Price, accept, invoice', '/omega-logic#orders'], ['Customers', 'Accounts and people', '/portals/customer/admin.html'], ['Office app', 'On a phone', '/office/app']] },
    { key: 'plant',    label: 'Plant',    icon: '⚙', hint: 'build',  logic: 'logic-plant',     pages: [['Work order board', 'What to build', '/plant/work-orders.html'], ['Plant board', 'Live station map', '/plant/manager.html'], ['Plant app', 'The bench', '/plant/app']] },
    { key: 'deliver',  label: 'Deliver',  icon: '➜', hint: 'ship, custody', logic: 'logic-logistics', pages: [['Shipping & receiving', 'Loads and lanes', '/logic-logistics.html'], ['Sites & custody', 'Where every unit is', '/logic-custody.html']] },
    { key: 'design',   label: 'Design',   icon: '▧', hint: 'Site Map, sandbox', tools: ['editor', 'sandbox', 'siteoptimizer', 'powerflow', 'sitediscovery', 'conductorsizing'] },
    { key: 'grid',     label: 'Grid',     icon: '⌗', hint: 'capacity, screen', tools: ['gridatlas', 'interconnect', 'comedcap', 'sitefinder', 'interconnectstudy'] },
    { key: 'money',    label: 'Finance',  icon: '$',      hint: 'capital, size, model', also: ['financing'], tools: ['batterysizer', 'valuestack', 'vppsim', 'computeproforma', 'isocalc', 'proforma', 'dcfc', 'apartment', 'fleet', 'investment', 'costestimator'] },
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
     the catalog's own name and link, locked ones last and marked. `also`
     are tools the panel lists first that never earn the area its cell (the
     financing portal is open on every plan, so it would put Finance on
     every hub): Finance leads with the portal where it has a cell */
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
    (a.also || []).concat(a.tools || []).forEach(function (k) {
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
    return isFinite(until) && until < (now || Date.now()) ? [] : a.live.slice();
  }
  function legacyCtx(o) {
    o = o || {};
    var tools = o.tools, ws = o.ws || {}, billing = o.billing, who = o.who || {};
    var canOpen = typeof o.canOpen === 'function' ? o.canOpen : function (k) {
      return tools && typeof tools.isUnlocked === 'function' ? tools.isUnlocked(k) : true;
    };
    var visible = tools && typeof tools.isVisible === 'function' ? function (k) { return tools.isVisible(k); } : null;
    var tool = tools && typeof tools.byKey === 'function' ? function (k) { return tools.byKey(k); } : null;
    var addOns = Array.isArray(o.addOns) ? o.addOns : liveAddOns(billing, o.now);
    var e = editorCtx(o.caps || (root && root.OmegaCaps), billing, who);
    return {
      canOpen: canOpen,
      tool: tool,
      visible: visible,
      modules: ws.modules || [],
      addons: ws.addons || [],
      addOns: addOns,
      editorModules: addOns,
      hideMarketplace: !!ws.hideMarketplace,
      packaged: !!ws.packaged,
      tierLevel: typeof ws.tierLevel === 'number' ? ws.tierLevel : 0,
      billing: billing,
      whiteLabel: ws.whiteLabel,
      canCap: e ? e.canCap : null,
      ungated: e ? e.ungated : null,
      editorCan: e ? e.editorCan : null
    };
  }
  /* one card for a module: status, note, at most one action (Open / Buy /
     Ask). The Modules page and the marketplace store both render this. */
  function moduleCard(m, ctx) {
    var state = moduleState(m, ctx);
    var note = state === 'part' ? moduleNote(m, ctx) : '';
    return { key: m.key, name: m.name || m.key, state: state, note: note };
  }
  var api = {
    AREAS: AREAS,
    compose: compose,
    items: items,
    moduleState: moduleState,
    moduleTools: moduleTools,
    moduleEditor: moduleEditor,
    moduleNote: moduleNote,
    moduleCard: moduleCard,
    editorCtx: editorCtx,
    capsFor: capsFor,
    legacyCtx: legacyCtx,
    storefront: storefront,
    liveAddOns: liveAddOns
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.OmegaWorkspaceHub = api;
})(typeof window !== 'undefined' ? window : global);
