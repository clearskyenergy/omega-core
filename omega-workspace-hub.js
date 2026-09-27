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

   ctx = { canOpen(toolKey) → bool, tool(toolKey) → catalog entry | null,
           modules[] (a packaged workspace's), addons[] (a legacy one's),
           hideMarketplace }

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
    { key: 'money',    label: 'Finance',  icon: '$',      hint: 'size, revenue, model', tools: ['batterysizer', 'valuestack', 'isocalc', 'proforma', 'dcfc', 'apartment', 'fleet', 'investment', 'costestimator'] },
    { key: 'sales',    label: 'Sales',    icon: '▤', hint: 'proposals, estimates', tools: ['sales', 'spatco_ev', 'evcostwb', 'computelease'] },
    { key: 'market',   label: 'Market',   icon: '◈', hint: 'partners, quotes', market: true, tools: ['financing', 'opportunity', 'osaportal'], pages: [['Marketplace', 'The tools catalogue: BESS, EV and finance tools', '/marketplace.html'], ['Quote Desk', 'Both ends of a request for quote', '/rfq.html']] },
    { key: 'compute',  label: 'Compute',  icon: '▦', hint: 'data centers', tools: ['datacenter', 'computepower'] },
    { key: 'permits',  label: 'Permits',  icon: '✓', hint: 'AHJ, intake', tools: ['permit', 'intake', 'sitelifecycle'] },
    { key: 'ops',      label: 'Operate',  icon: '◉', hint: 'O&M, fleet', tools: ['signal', 'omconsole', 'fieldservice', 'slaintel', 'ownerreport', 'fleetcommand', 'degradation', 'evcloseout'] },
    { key: 'team',     label: 'Team',     icon: '◌', hint: 'people, feed', always: true, pages: [['Team', 'Who is in the workspace', '#team'], ['Feed', 'What changed', '#feed']] }
  ];
  var RING_MAX = 6;
  function byKey(key) { for (var i = 0; i < AREAS.length; i++) if (AREAS[i].key === key) return AREAS[i]; return null; }
  function has(list, k) { return Array.isArray(list) && list.indexOf(k) >= 0; }
  /* does this workspace hold an Omega Logic part: a packaged one by module,
     a legacy one by the omega-logic add-on (which holds every part) */
  function holdsLogic(ctx, part) { return has(ctx.modules, part) || has(ctx.addons, 'omega-logic'); }
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
    var open = [], locked = [];
    (a.tools || []).forEach(function (k) {
      var t = ctx.tool ? ctx.tool(k) : null; if (!t || t.soon) return;
      var row = { key: k, name: t.name, sub: t.blurb || t.desc || '', locked: !(ctx.canOpen && ctx.canOpen(k)) };
      (row.locked ? locked : open).push(row);
    });
    return out.concat(open, locked);
  }
  /* ── DOES THIS WORKSPACE HOLD A MODULE? One rule for the Modules page
     and the marketplace store (Tommy, 2026-09-27: every module listed,
     marked by whether it is used or given). ctx as compose() takes it,
     plus packaged (bool) and tierLevel (the legacy tier).
       packaged   held when the server's projection lists it, else open
       legacy     an Omega Logic part: held by the omega-logic add-on;
                  a module of tools: held when every tool it carries is
                  open on the tier, part when some are, else ask;
                  a module of editor capabilities alone (plan sets, site
                  intelligence, the storefront): held on Enterprise, the
                  legacy tier that carries every capability, else ask.
     Answers 'held' | 'part' | 'ask' | 'open'. Showing a state is never
     access: the tools and the editor check the same plan. */
  function moduleTools(m, ctx) {
    ctx = ctx || {};
    var total = 0, open = 0;
    ((m && m.tools) || []).forEach(function (k) {
      if (ctx.tool && !ctx.tool(k)) return;
      total++; if (ctx.canOpen && ctx.canOpen(k)) open++;
    });
    return { open: open, total: total };
  }
  /* The capabilities of a module that the LEGACY editor decides, and how
     many of them this tier grants. ctx.editorCan(cap) answers true / false
     for a capability on the editor's tier ladder and null for one it does
     not check (OmegaCaps.editorCan). Without it, nothing is counted. */
  function moduleEditor(m, ctx) {
    ctx = ctx || {};
    var total = 0, open = 0;
    if (typeof ctx.editorCan !== 'function') return { open: 0, total: 0 };
    ((m && m.caps) || []).forEach(function (c) {
      var v = ctx.editorCan(c);
      if (v === null || v === undefined) return;
      total++; if (v) open++;
    });
    return { open: open, total: total };
  }
  function moduleState(m, ctx) {
    ctx = ctx || {}; if (!m) return 'ask';
    if (ctx.packaged) return has(ctx.modules, m.key) ? 'held' : 'open';
    if (m.key === 'lite') return 'held';        /* the floor every plan stands on */
    if (/^logic-/.test(m.key)) return holdsLogic(ctx, m.key) ? 'held' : 'ask';
    /* a legacy plan holds a module when its tools open AND Site Map grants
       the module's editor capabilities on this tier: the Modules page says
       what the editor does (2026-09-27: "the modules are paid services tied
       directly to the editor") */
    var t = moduleTools(m, ctx), e = moduleEditor(m, ctx), open = t.open + e.open, total = t.total + e.total;
    if (!total) return (ctx.tierLevel >= 3) ? 'held' : 'ask';
    return open === total ? 'held' : open ? 'part' : 'ask';
  }
  /* ── ONE CARD, ONE STATUS, AT MOST ONE ACTION (Tommy, 2026-09-27: "the
     opt in and opt out stuff you need to make that make sense"). Every
     surface that shows a module to a workspace — the Modules page, the
     home row, Plan & billing's changes in progress — reads its card here,
     so a module can never say Live in one place and Opt in in another.
       m        the catalog entry (key, name, shelf, tools, caps)
       ctx      as moduleState takes it
       billing  billing/current as the workspace reads it: subscription,
                optIns{}, optOuts{}, removalRequests[], paymentLink
       summary  GET /api/plan-change, or null while it loads or failed:
                pending[], gate{canApply, reason}, nextReviewOn
       opts     { admin, pendingApproval, planName, company, price }
     A state, first match wins:
       included  Lite, the floor every plan stands on
       awaiting  a change invoice for it is open (packaged)
       bought    in the subscription, not switched on yet (packaged)
       removing  an opt-out is queued (packaged: for the review; legacy:
                 with ClearSky)
       live      on the plan
       requested an opt-in is recorded, waiting on ClearSky (legacy)
       part      some of it is on the plan (legacy)
       available not on the plan
     The words are the contract's: Opt in, Opt out, Cancel request; never
     Subscribe or Ask. The action is what the button does; the ONE menu
     (omega-package-menu.js) confirms it and states the money before
     anything is written. Nothing here prices: the price is the server's
     display string, handed in, shown once on the card (the button says
     only Opt in; the menu repeats the figure before anything is sent). */
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
  function moduleCard(m, ctx, billing, summary, opts) {
    ctx = ctx || {}; billing = billing || {}; opts = opts || {};
    var key = m && m.key, packaged = !!ctx.packaged, price = opts.price || '', plan = opts.planName || 'your plan', co = opts.company || 'your workspace';
    var card = { key: key, state: 'available', pill: 'Not on your plan', tone: 'off', held: false, priceLine: price, note: '', action: null, secondary: null, adminLine: '' };
    var st = moduleState(m, ctx);
    var sub = billing.subscription && Array.isArray(billing.subscription.modules) ? billing.subscription.modules : [];
    var wait = null;
    ((summary && summary.pending) || []).forEach(function (p) { if (!wait && Array.isArray(p.add) && p.add.indexOf(key) >= 0) wait = p; });
    var queued = null;
    (Array.isArray(billing.removalRequests) ? billing.removalRequests : []).forEach(function (r) { if (r && r.module === key) queued = r; });
    var optOut = !packaged ? listed(billing.optOuts, key) : null, optIn = !packaged ? listed(billing.optIns, key) : null;
    if (key === 'lite') {
      card.state = 'included'; card.pill = 'Live · always included'; card.tone = 'live'; card.held = true;
      card.priceLine = 'In every plan'; card.note = 'Always on. Nothing to opt in to or out of.';
      return card;
    }
    if (packaged && wait) {
      card.state = 'awaiting'; card.pill = 'Waiting for payment'; card.tone = 'wait';
      card.note = (wait.display ? wait.display + ' invoice · ' : '') + (wait.expiresOn ? 'pay by ' + shortDay(wait.expiresOn) + ' · ' : '') + 'switches on when paid';
      card.action = wait.paymentLink ? { kind: 'pay', label: 'Pay' + (wait.display ? ' ' + wait.display : ''), href: wait.paymentLink } : { kind: 'billing', label: 'Plan & billing' };
      card.secondary = { kind: 'cancel', label: 'Cancel request' };
    } else if (packaged && st !== 'held' && sub.indexOf(key) >= 0) {
      card.state = 'bought'; card.pill = 'Bought · not on yet'; card.tone = 'wait';
      card.note = 'Switches on when your open invoice is paid.';
      card.action = billing.paymentLink ? { kind: 'pay', label: 'Pay now', href: billing.paymentLink } : { kind: 'billing', label: 'Plan & billing' };
    } else if ((packaged && queued && st === 'held') || (optOut && (st === 'held' || st === 'part'))) {
      card.state = 'removing'; card.pill = 'Opting out'; card.tone = 'wait'; card.held = true;
      var review = (queued && queued.reviewOn) || (summary && summary.nextReviewOn) || null;
      card.note = packaged
        ? 'Stays on, and billed, until ' + (review ? 'your review on ' + shortDay(review) : 'your next quarterly review') + '.'
        : 'Requested ' + shortDay(optOut.requestedAt) + '. ClearSky confirms the date and any price change in writing; access is unchanged until then.';
      card.action = { kind: 'cancel', label: 'Cancel request' };
    } else if (st === 'held') {
      card.state = 'live'; card.pill = 'Live'; card.tone = 'live'; card.held = true;
      card.priceLine = packaged ? (price ? price + ' · in your monthly fee' : 'In your plan') : 'Included in ' + plan;
      card.note = 'On your plan.';
      card.action = { kind: 'remove', label: 'Opt out' };
    } else if (optIn) {
      card.state = 'requested'; card.pill = 'Opt-in requested'; card.tone = 'wait';
      card.priceLine = optIn.display || price;
      card.note = 'Requested ' + shortDay(optIn.requestedAt) + (optIn.display || price ? ' at ' + (optIn.display || price) : '') + '. It joins your monthly invoice once ClearSky moves you to monthly billing; nothing is charged before you approve that invoice.';
      card.action = { kind: 'cancel', label: 'Cancel request' };
    } else if (st === 'part') {
      var t = moduleTools(m, ctx), e = moduleEditor(m, ctx), bits = [];
      if (t.total) bits.push(t.open + ' of ' + t.total + ' tools');
      if (e.total) bits.push(e.open + ' of ' + e.total + ' Site Map features');
      card.state = 'part'; card.pill = 'Partly included'; card.tone = 'part';
      card.note = (bits.length ? bits.join(' and ') + (bits.length > 1 || (t.open + e.open) !== 1 ? ' are' : ' is') + ' in ' + plan + '. ' : 'Part of it is in ' + plan + '. ') + 'Opting in adds the rest' + (price ? ' for ' + price : '') + '.';
      card.action = { kind: 'add', label: 'Opt in' };
    } else {
      var gate = summary && summary.gate;
      card.note = packaged
        ? (gate && gate.canApply === false && gate.reason ? gate.reason : 'Prorated today, then ' + (price || 'its monthly price') + '.')
        : 'Adds ' + (price || 'its monthly price') + ' once ClearSky moves you to monthly billing.';
      card.action = { kind: 'add', label: 'Opt in' };
      if (packaged && gate && gate.canApply === false) card.action.disabled = true;
    }
    /* who may press it: a workspace waiting on approval opens nothing yet;
       anyone but an owner or administrator reads the card and is told who
       changes it (the server refuses them too) */
    if (opts.pendingApproval && !card.held) { card.note = 'Opens when ClearSky approves ' + co + '.'; card.action = null; card.secondary = null; }
    else if (opts.admin === false && card.action && card.action.kind !== 'billing') { card.action = card.action.kind === 'pay' ? card.action : null; card.secondary = null; card.adminLine = 'An owner or administrator of ' + co + ' changes modules.'; }
    return card;
  }
  var API = { AREAS: AREAS, compose: compose, items: items, moduleState: moduleState, moduleTools: moduleTools, moduleEditor: moduleEditor, moduleCard: moduleCard, shortDay: shortDay, RING_MAX: RING_MAX };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (root) root.OmegaWorkspaceHub = API;
})(typeof window !== 'undefined' ? window : null);
