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
    var first = ring.filter(function (a) { return a.key === 'projects'; }), last = ring.filter(function (a) { return a.key !== 'projects'; });
    var room = RING_MAX - first.length - last.length;
    return { centre: byKey('today'), ring: first.concat(fill.slice(0, Math.max(0, room)), last).slice(0, RING_MAX) };
  }
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
  function moduleTools(m, ctx) {
    ctx = ctx || {};
    var total = 0, open = 0;
    ((m && m.tools) || []).forEach(function (k) {
      if (ctx.tool && !ctx.tool(k)) return;
      if (ctx.visible && !ctx.visible(k)) return;
      total++; if (ctx.canOpen && ctx.canOpen(k)) open++;
    });
    return { open: open, total: total };
  }
  function moduleEditor(m, ctx) {
    ctx = ctx || {};
    var gates = (m && m.legacyGates) || [], open = 0;
    var can = typeof ctx.canCap === 'function' ? ctx.canCap : typeof ctx.editorCan === 'function' ? function (c) { return ctx.editorCan(c) === true; } : null;
    if (!gates.length || !can) return { open: 0, total: 0 };
    var editor = !ctx.tool || !ctx.tool('editor') || !ctx.canOpen || ctx.canOpen('editor');
    if (editor && has(ctx.editorModules, m.key)) return { open: gates.length, total: gates.length };
    if (editor) gates.forEach(function (g) { if (!g || String(g).split('+').every(function (c) { return can(c); })) open++; });
    return { open: open, total: gates.length };
  }
  function moduleState(m, ctx) {
    ctx = ctx || {}; if (!m) return 'ask';
    if (ctx.packaged) return has(ctx.modules, m.key) ? 'held' : 'open';
    if (m.key === 'lite') return 'held';
    if (has(ctx.addOns, m.key)) return 'held';
    if (/^logic-/.test(m.key)) return holdsLogic(ctx, m.key) ? 'held' : 'ask';
    if (m.key === 'whitelabel' && ctx.billing !== undefined) return storefront(ctx.billing, ctx.whiteLabel) ? 'held' : 'ask';
    var t = moduleTools(m, ctx), e = moduleEditor(m, ctx), total = t.total + e.total, open = t.open + e.open;
    if (!total) return (typeof ctx.ungated === 'boolean' ? ctx.ungated : typeof ctx.canCap === 'function' ? ctx.canCap('all') === true : ctx.tierLevel >= 3) ? 'held' : 'ask';
    return open === total ? 'held' : open ? 'part' : 'ask';
  }
  function storefront(billing, whiteLabel) {
    var b = billing || {}, overrides = b.toolOverrides || {}, addons = b.addons || [], wl = whiteLabel || {};
    return overrides.whitelabel === true
      || (overrides.whitelabel !== false
          && (addons.indexOf('whitelabel') >= 0 || wl.enabled === true));
  }
  function moduleNote(m, ctx) {
    var t = moduleTools(m, ctx), e = moduleEditor(m, ctx), bits = [];
    if (t.total) bits.push(t.open + ' of ' + t.total + ' of its tools');
    if (e.total) bits.push(e.open === e.total ? 'all of its commands in Site Map' : e.open ? 'some of its commands in Site Map' : 'none of its commands in Site Map');
    return bits.length ? bits.join(' and ') + (bits.length > 1 || t.open !== 1 || !t.total ? ' are' : ' is') + ' on your plan' : '';
  }
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
  function workspaceRecord(billing, org, caps) {
    return (!billing || !billing.tier) && caps && (caps.INTERNAL_DOMAINS || []).indexOf(org) >= 0 ? null : (billing || {});
  }
  function capsFor(billing, org, caps) {
    caps = caps || (root && root.OmegaCaps);
    var o = String(org || '').toLowerCase();
    var e = editorCtx(caps, workspaceRecord(billing, o, caps), { orgId: o });
    return e ? e.canCap : null;
  }
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
  function moduleCard(m, ctx) {
    var state = moduleState(m, ctx);
    var note = state === 'part' ? moduleNote(m, ctx) : '';
    return { key: m.key, name: m.name || m.key, state: state, note: note };
  }
  var API = {
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
    liveAddOns: liveAddOns,
    storefront: storefront,
    holdsLogic: holdsLogic,
    RING_MAX: RING_MAX
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (root) root.OmegaWorkspaceHub = API;
})(typeof window !== 'undefined' ? window : null);
