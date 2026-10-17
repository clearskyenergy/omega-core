/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   omega-workspace-v2.js — the journey home.

   PURE. Records and the existing Today list in, a calmer page model out.
   No Firestore, no DOM. The live home (workspace.html) does not load this.
   /workspace-v2 paints OmegaWorkspaceV2.home().

   What it changes about the words, and what it does not:
     Today (omega-workspace-today.js) still ranks. This file only presents.
     Account rows (trial, past due, read-only, approval) leave the work list.
     The same review title is one row. A design queue is a count, never a
     run of addresses. In-flight cards with one name are one card.
     The eight steps are the job: arrive, find the customer, open a project,
     design, analyze, propose, order, track. Each step is a real door.

   A customer profile on every project is the direction the Portfolio
   relaunch is taking. This file treats customerId / customerName /
   accountId (or customer.id) as "a customer is attached" and does not
   invent a second customer book. ES5. */
(function (root) {
  'use strict';
  var DAY = 86400000;
  /* doors the catalog already serves. The page may pass hrefs from
     OMEGATools.hrefFor so an org override wins; these are the fallback. */
  var FILES = {
    gridatlas: '/grid-atlas.html',
    vppsim: '/vpp-earnings.html',
    computeproforma: '/compute-proforma.html',
    sales: '/sales-proposal.html',
    proforma: '/proforma.html',
    omegaprime: '/omega-prime.html',
    sitefinder: '/clearsky-sitefinder.html',
    portfolio: '/portfolio.html',
    projects: '/projects.html',
    quotes: '/rfq.html',
    customers: '/portals/customer/admin.html',
    orders: '/omega-logic#orders',
    billing: '/workspace#billing',
    modules: '/workspace#modules',
    tools: '/workspace#tools',
    team: '/workspace#team',
    feed: '/workspace#feed',
    finance: '/portals/finance/'
  };
  var ACCOUNT = { readonly: 1, billing: 1, pastdue: 1, approval: 1, trial: 1 };

  function norm(s) {
    return String(s || '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function keyOf(r) { return String(r && r.key || '').split(':')[0]; }
  function reviewOf(r) {
    var m = /^(.*?) has been in review for (.+)$/.exec(r && r.t || '');
    if (!m || keyOf(r) !== 'review') return null;
    return { name: m[1].replace(/\s+/g, ' ').trim(), wait: m[2].replace(/\s+/g, ' ').trim() };
  }
  function countOf(r) {
    var m = /^(\d+)\s/.exec(r && r.t || '');
    if (m) return +m[1];
    if (r && r.projects && r.projects.length) return r.projects.length;
    return 1;
  }
  /* a comma list that repeats itself is the address dump. Drop it. */
  function tidy(s) {
    s = String(s || '').replace(/\s+/g, ' ').trim();
    if (!s) return '';
    if (s.length > 180) return '';
    var parts = s.split(',').map(function (x) { return norm(x); }).filter(Boolean);
    if (parts.length >= 3) {
      var seen = {}, dup = false;
      parts.forEach(function (p) { if (seen[p]) dup = true; seen[p] = 1; });
      if (dup) return '';
    }
    return s;
  }
  function base(r) {
    return {
      key: r.key, cls: r.cls || '', title: String(r.t || '').replace(/\s+/g, ' ').trim(),
      detail: tidy(r.s), cta: r.cta || 'Open', href: r.href || null, act: r.act || null, count: 1
    };
  }
  function queueRow(r) {
    var row = base(r), k = keyOf(r), n = countOf(r);
    if (k === 'size') {
      row.title = n > 1 ? n + ' candidates need a battery size' : row.title;
      row.detail = n > 1 ? 'The list is on Projects. Start with the oldest.' : 'No battery size yet.';
      row.cta = 'Projects';
      row.href = FILES.projects;
      row.act = null;
    } else {
      row.title = n > 1 ? n + ' projects have nothing on the site map' : row.title;
      row.detail = n > 1 ? 'Open the oldest in Site Map and run it.' : (row.detail || 'Nothing on the site map yet.');
      if (n > 1 && r.act) { row.cta = 'Design'; row.href = null; row.act = r.act; }
    }
    row.count = n;
    return row;
  }
  function collapseReviews(rows) {
    var first = base(rows[0]), rev = reviewOf(rows[0]);
    if (rows.length === 1) {
      first.detail = first.detail || 'Sent to the finance marketplace. Follow up once.';
      return first;
    }
    first.key = 'review-group:' + norm(rev.name);
    first.title = rev.name;
    first.detail = rows.length + ' records, in review for ' + rev.wait + '. Follow up once.';
    first.cta = 'Follow up';
    first.count = rows.length;
    first.href = rows[0].href || null;
    first.act = null;
    return first;
  }

  /* Today keeps six rows. A second copy of a review can fall off that list
     and the one that stayed would still read as its own sentence. The page
     passes the finance records it already loaded; a review older than a
     week that is not already in the list is added so the titles collapse.
     The sentence is the one Today writes. */
  function at(t) { if (!t) return 0; if (typeof t === 'number') return t; if (t.toDate) return t.toDate().getTime(); if (t.seconds != null) return t.seconds * 1000; var d = new Date(t); return isNaN(d.getTime()) ? 0 : d.getTime(); }
  function heldReviews(finance, needs, now) {
    now = now || Date.now();
    var have = {};
    (needs || []).forEach(function (r) { if (r && r.key) have[r.key] = 1; });
    var out = [];
    (finance || []).forEach(function (f) {
      if (!f || f.status !== 'review') return;
      var upd = at(f.updatedAt) || at(f.createdAt);
      if (!(upd && now - upd >= 7 * DAY)) return;
      var id = f.id || f.name || f.title || '';
      var key = 'review:' + id;
      if (have[key]) return;
      var d = Math.max(1, Math.round((now - upd) / DAY));
      out.push({
        key: key, cls: 'warn',
        t: (f.name || f.title || 'A deal') + ' has been in review for ' + d + (d === 1 ? ' day' : ' days'),
        s: 'Sent to the finance marketplace; ClearSky has not published it yet. Follow up.',
        cta: 'Follow up', href: '/finance#deal=' + encodeURIComponent(id)
      });
    });
    return out;
  }

  function present(needs) {
    var account = [], rest = [];
    (needs || []).forEach(function (r) {
      if (!r) return;
      if (ACCOUNT[keyOf(r)]) account.push(base(r));
      else rest.push(r);
    });
    var reviewGroups = {}, reviewOrder = [], quotes = [], todos = [], queue = [], other = [];
    rest.forEach(function (r) {
      var rev = reviewOf(r);
      if (rev) {
        var nk = norm(rev.name) || r.key;
        if (!reviewGroups[nk]) { reviewGroups[nk] = []; reviewOrder.push(nk); }
        reviewGroups[nk].push(r);
        return;
      }
      var k = keyOf(r);
      if (k === 'size' || k === 'design') queue.push(r);
      else if (k === 'todo') todos.push(r);
      else if (k === 'price' || k === 'quotes' || k === 'silent' || k === 'referrals') quotes.push(r);
      else other.push(r);
    });
    var groups = [];
    function add(key, label, rows) { if (rows.length) groups.push({ key: key, label: label, rows: rows }); }
    add('reviews', 'Reviews', reviewOrder.map(function (nk) { return collapseReviews(reviewGroups[nk]); }));
    add('quotes', 'Quotes', quotes.map(base));
    add('todos', 'To-dos', todos.map(base));
    add('work', 'Projects', other.map(base));
    add('queue', 'Design queue', queue.map(queueRow));
    return { account: account, groups: groups };
  }

  function track(cards) {
    var seen = {}, out = [];
    (cards || []).forEach(function (c) {
      if (!c) return;
      var k = norm(c.name) || String(c.id || '');
      if (seen[k]) { seen[k].copies++; return; }
      var copy = {};
      Object.keys(c).forEach(function (p) { copy[p] = c[p]; });
      copy.copies = 1;
      if (copy.why && String(copy.why).length > 140) copy.why = String(copy.why).slice(0, 137) + '…';
      seen[k] = copy;
      out.push(copy);
    });
    out.forEach(function (c) {
      if (c.copies < 2) return;
      var why = String(c.why || ''), name = String(c.name || '');
      if (name && why.indexOf(name) === 0) why = why.slice(name.length).replace(/^[\s:–—-]+/, '');
      c.why = (why ? why + ' · ' : '') + 'Saved ' + c.copies + ' times under this name';
    });
    return out;
  }

  function customerOf(p) {
    if (!p) return '';
    if (p.customerId || p.customerName || p.accountId) return p.customerId || p.customerName || p.accountId;
    var c = p.customer;
    return c && (c.id || c.name) || '';
  }
  function openTool(ctx, key) {
    if (ctx.canOpen && ctx.canOpen(key) === false) return null;
    if (ctx.hrefs && ctx.hrefs[key]) return ctx.hrefs[key];
    return FILES[key] || null;
  }
  function suggest(ctx) {
    if (ctx.pendingApproval || ctx.readOnly || (ctx.pastDue && Number(ctx.pastDue.days) > 15)) return 'arrive';
    var n = (ctx.projects || []).length;
    var queue = (ctx.needsSize || 0) + (ctx.needsDesign || 0);
    if (!n) return 'customer';
    if (queue >= 8 || (queue > 0 && queue * 2 >= n)) return 'design';
    if (ctx.quotesWaiting) return 'propose';
    if (ctx.reviews) return 'track';
    if (ctx.pastCandidate) return 'track';
    if (queue) return 'design';
    return 'project';
  }
  function customersHref(ctx) { return ctx.logicOffice ? FILES.customers : FILES.sitefinder; }

  function journey(ctx) {
    ctx = ctx || {};
    var projects = ctx.projects || [];
    var office = !!ctx.logicOffice;
    var focus = ctx.focus || null;
    var queue = (ctx.needsSize || 0) + (ctx.needsDesign || 0);
    var nowKey = suggest(ctx);
    var attached = projects.some(function (p) { return !!customerOf(p); });
    var designed = projects.some(function (p) { return Number(p.capex) > 0 || p.capexSource === 'site-map' || p.capexAt; });
    var projectHref = focus && ctx.projectHref ? ctx.projectHref(focus.id) : (focus ? '/editor.html?id=' + encodeURIComponent(focus.id) : null);
    var grid = openTool(ctx, 'gridatlas');
    if (grid && focus && (focus.address || focus.name) && !/[?&]q=/.test(grid)) {
      grid += (grid.indexOf('?') >= 0 ? '&' : '?') + 'q=' + encodeURIComponent(String(focus.address || focus.name).slice(0, 180));
    }
    var sales = openTool(ctx, 'sales');
    var prime = openTool(ctx, 'omegaprime');
    var proposeHref = sales || FILES.quotes;
    var steps = [
      { key: 'arrive', n: '1', label: 'Arrive', blurb: 'Sign in', title: ctx.pendingApproval ? 'Your workspace is being set up' : 'You are in',
        detail: ctx.pendingApproval ? 'ClearSky is approving this workspace. Tools stay locked until then, usually one business day.' : (ctx.readOnly ? 'The workspace is read-only until the invoice is paid.' : 'Plan, billing and teammates sit under Account.'),
        href: FILES.billing, cta: ctx.pendingApproval ? 'See status' : 'Plan & billing',
        done: !ctx.pendingApproval && !ctx.readOnly },
      { key: 'customer', n: '2', label: 'Customer', blurb: 'Who it is for', title: 'Find the customer',
        detail: office ? 'Open the customer account. A project should attach to it. Portfolio holds the sites.' : 'Find a site, then keep the record in Portfolio. Attaching every project to a customer profile is the next release.',
        href: customersHref(ctx), cta: office ? 'Customers' : 'Find a site',
        links: [{ href: FILES.portfolio, label: 'Portfolio' }],
        done: attached },
      { key: 'project', n: '3', label: 'Project', blurb: 'Open a site', title: projects.length ? 'Open a project' : 'Create the first project',
        detail: projects.length ? projects.length + ' open. Start another, or open the list.' : 'Name the site. It opens in Site Map.',
        href: FILES.projects, cta: 'New project', act: { kind: 'new' },
        links: [{ href: FILES.projects, label: 'All projects' }],
        done: projects.length > 0 },
      { key: 'design', n: '4', label: 'Design', blurb: 'Draw it', title: queue ? 'Design the sites that are still blank' : 'Draw the site',
        detail: queue ? queue + (queue === 1 ? ' site still needs a design or a battery size.' : ' sites still need a design or a battery size.') : 'Site Map is the drawing. Omega Prime walks a new site from the grid to a quote.',
        href: projectHref || (prime || FILES.projects), cta: projectHref ? 'Open in Site Map' : 'Projects',
        links: prime ? [{ href: prime, label: 'Omega Prime' }] : [],
        done: projects.length > 0 && !queue && designed },
      { key: 'analyze', n: '5', label: 'Analyze', blurb: 'Grid and returns', title: 'Check the grid and the returns',
        detail: 'Grid Atlas, VPP earnings and the compute pro forma. They read the site. They do not replace the drawing.',
        href: grid || FILES.modules, cta: grid ? 'Grid Atlas' : 'See modules',
        links: [openTool(ctx, 'vppsim') && { href: openTool(ctx, 'vppsim'), label: 'VPP earnings' }, openTool(ctx, 'computeproforma') && { href: openTool(ctx, 'computeproforma'), label: 'Compute pro forma' }].filter(Boolean),
        done: designed },
      { key: 'propose', n: '6', label: 'Propose', blurb: 'A number', title: 'Send a number they can sign',
        detail: 'A sales proposal, a pro forma, or a request for quote.',
        href: proposeHref, cta: sales ? 'Proposal' : 'Quote Desk',
        links: [{ href: FILES.quotes, label: 'Quote Desk' }, openTool(ctx, 'proforma') && { href: openTool(ctx, 'proforma'), label: 'Pro forma' }].filter(Boolean),
        done: (ctx.rfqsSent || 0) > 0 },
      { key: 'order', n: '7', label: 'Order', blurb: 'Place it', title: office ? 'Price and accept the order' : 'Ask for a price',
        detail: office ? 'Orders live in Omega Logic. Shipment stays with ClearSky.' : 'The Quote Desk asks vendors. Ordering a built system is Omega Logic, when that module is on.',
        href: office ? FILES.orders : FILES.quotes, cta: office ? 'Orders' : 'Quote Desk',
        done: false },
      { key: 'track', n: '8', label: 'Track', blurb: 'Follow through', title: 'Follow the work',
        detail: 'Projects, Portfolio and the finance marketplace. Each site is listed once below.',
        href: '#track', cta: 'In motion',
        links: [{ href: FILES.projects, label: 'Projects' }, { href: FILES.portfolio, label: 'Portfolio' }, { href: FILES.finance, label: 'Finance' }],
        done: false }
    ];
    var nowAt = 0;
    steps.forEach(function (s, i) { if (s.key === nowKey) nowAt = i; });
    steps.forEach(function (s, i) {
      s.now = i === nowAt;
      if (s.now || i > nowAt) s.done = false;
      if (!s.links) s.links = [];
    });
    return { now: nowKey, steps: steps, focus: focus };
  }

  function hiddenNav() {
    return [
      { divider: 'sn-jv-divider', label: 'Joint development', labelId: 'sn-jv-label', hidden: true },
      { key: 'osa', id: 'sn-osa', label: 'OSA Workspace', icon: 'shield', href: '/osa', sn: 'osa', hidden: true },
      { key: 'design', id: 'sn-design', label: 'Design Queue', icon: 'pen', href: '/jd-workspace.html', sn: 'design', hidden: true, labelSpan: 'sn-design-label', count: 'sn-design-n' },
      { key: 'jda', id: 'sn-jda', label: 'JD Partners', icon: 'file', href: '/jda.html', sn: 'jda', hidden: true },
      { key: 'dealroom', id: 'sn-dealroom', label: 'Deal Room', icon: 'bank', href: '/portals/finance/', sn: 'dealroom', hidden: true },
      { divider: 'sn-adm-divider', label: 'Administration', labelId: 'sn-adm-label', hidden: true },
      { key: 'admin', id: 'sn-admin', label: 'Admin Console', icon: 'shield', href: '/admin/', sn: 'admin', hidden: true },
      { key: 'ops', id: 'sn-ops', label: 'Ops Console', icon: 'console', href: '/console/', sn: 'ops', hidden: true },
      { mount: 'sn-extra' }
    ];
  }
  function nav(ctx) {
    ctx = ctx || {};
    var door = customersHref(ctx);
    return [
      { section: 'Work' },
      { key: 'home', label: 'Home', icon: 'home', href: '/workspace-v2', sn: 'dashboard' },
      { key: 'customers', label: 'Customers', icon: 'me', href: door, sn: 'customers', title: ctx.logicOffice ? 'Customer accounts' : 'Find a site. The site book is Portfolio.' },
      { key: 'projects', label: 'Projects', icon: 'projects', href: FILES.projects, sn: 'projects' },
      { key: 'portfolio', label: 'Portfolio', icon: 'portfolio', href: FILES.portfolio, sn: 'portfolio' },
      { section: 'Library' },
      { key: 'tools', label: 'Tools', icon: 'tools', href: FILES.tools, sn: 'apps' },
      { key: 'modules', label: 'Modules', icon: 'modules', href: FILES.modules, sn: 'modules' },
      { key: 'marketplace', label: 'Marketplace', icon: 'marketplace', href: '/marketplace.html', sn: 'marketplace' },
      { section: 'Desk' },
      { key: 'quotes', label: 'Quotes', icon: 'quotes', href: FILES.quotes, sn: 'rfq' },
      { key: 'team', label: 'Team', icon: 'team', href: FILES.team, sn: 'team' },
      { key: 'feed', label: 'Feed', icon: 'feed', href: FILES.feed, sn: 'feed' }
    ].concat(hiddenNav()).concat([
      { section: 'Account' },
      { key: 'billing', label: 'Plan & billing', icon: 'billing', href: FILES.billing, sn: 'billing' },
      { key: 'settings', label: 'Settings', icon: 'settings', href: '/workspace-v2#settings', sn: 'settings' }
    ]);
  }
  function tabs(ctx) {
    ctx = ctx || {};
    return [
      ['home', 'Home', 'home', '/workspace-v2'],
      ['customers', 'Customers', 'me', customersHref(ctx)],
      ['projects', 'Projects', 'projects', FILES.projects],
      ['portfolio', 'Portfolio', 'portfolio', FILES.portfolio],
      ['me', 'Account', 'billing', FILES.billing]
    ];
  }
  function greet(ctx) {
    var h = new Date(ctx.now || Date.now()).getHours();
    var g = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
    return g + ', ' + (ctx.first || 'there');
  }
  function trialLeft(ctx) {
    if (!ctx.trialEndsAt) return null;
    return Math.ceil((Number(ctx.trialEndsAt) - (ctx.now || Date.now())) / DAY);
  }
  function statusLine(ctx) {
    var bits = [], left = trialLeft(ctx);
    if (ctx.company) bits.push(ctx.company);
    if (ctx.plan && !(left != null && /^trial$/i.test(ctx.plan))) bits.push(ctx.plan);
    if (left != null) bits.push(left > 0 ? 'Trial, ' + left + (left === 1 ? ' day' : ' days') + ' left' : 'Trial ended');
    return bits.join(' · ');
  }
  function home(ctx) {
    ctx = ctx || {};
    var needs = (ctx.needs || []).concat(heldReviews(ctx.finance, ctx.needs, ctx.now));
    var presented = present(needs);
    /* Today keeps six rows. A long design queue can fall off that list and
       the addresses would have been the row. Say the count anyway. */
    if (!presented.groups.some(function (g) { return g.key === 'queue'; })) {
      var rows = [];
      if ((ctx.needsSize || 0) > 1) rows.push({ key: 'size', cls: '', title: ctx.needsSize + ' candidates need a battery size', detail: 'The list is on Projects. Start with the oldest.', cta: 'Projects', href: FILES.projects, act: null, count: ctx.needsSize });
      if ((ctx.needsDesign || 0) > 1) rows.push({ key: 'design', cls: '', title: ctx.needsDesign + ' projects have nothing on the site map', detail: 'Open the oldest in Site Map and run it.', cta: 'Projects', href: FILES.projects, act: null, count: ctx.needsDesign });
      if (rows.length) presented.groups.push({ key: 'queue', label: 'Design queue', rows: rows });
    }
    var tracked = track(ctx.cards || []);
    /* a name saved more than once leads, so the pile is one card on the
       home. An account with no duplicates keeps the board's order. */
    tracked = tracked.slice().sort(function (a, b) {
      var ad = a.copies > 1 ? 1 : 0, bd = b.copies > 1 ? 1 : 0;
      if (ad !== bd) return bd - ad;
      return (b.rank || 0) - (a.rank || 0) || (b.touched || 0) - (a.touched || 0) || String(a.name || '').localeCompare(String(b.name || ''));
    });
    var show = 4;
    return {
      greet: greet(ctx),
      status: statusLine(ctx),
      fresh: !(ctx.projects && ctx.projects.length) && !ctx.pendingApproval,
      account: presented.account,
      groups: presented.groups,
      journey: journey(ctx),
      kpis: ctx.kpis || [],
      track: tracked.slice(0, show),
      trackMore: Math.max(0, tracked.length - show),
      more: ctx.more || 0,
      nav: nav(ctx),
      tabs: tabs(ctx)
    };
  }

  var API = { home: home, present: present, journey: journey, track: track, nav: nav, tabs: tabs, suggest: suggest, norm: norm, greet: greet, statusLine: statusLine, heldReviews: heldReviews, FILES: FILES, customerOf: customerOf };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (root) root.OmegaWorkspaceV2 = API;
})(typeof window !== 'undefined' ? window : null);
