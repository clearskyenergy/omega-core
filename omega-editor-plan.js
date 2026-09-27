/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   omega-editor-plan.js — the plan chip in Site Map's title bar.

   Tommy, 2026-09-27: "you need to make sure the editor is linked to how a
   tenant pays and what their modules are". Site Map showed neither. A
   missing button was the only sign of a plan, a read-only workspace lost
   its tools with no reason and no way to pay, and nothing led to Plan &
   billing or Modules.

   ONE chip in #portal-nav (the mount editor.html gives it: #omega-plan),
   painted on the events OmegaCaps already sends — omega:package for a
   packaged workspace, omega:tier for a legacy one — and one panel under it:
     the plan and its state    Live · Read-only · Payment due, with the
                               server's monthly figure and next invoice
                               (GET /api/plan-change; any failure shows the
                               plan without figures, never an error)
     In Site Map / Elsewhere   the modules held, split by the price list's
                               own `editor` flag (GET /api/offerings)
     Changes in progress       waiting for payment, bought but not on yet,
                               opt-in requested, opting out
     Plan & billing ›, Modules ›  the workspace's pages, in a new tab so the
                               drawing on screen is never lost
   A read-only workspace is told why, gets the pay link and "I've paid"
   (reconcile-now, then the package is fetched again and the ribbon
   re-applied, no reload). A plan that could not be checked says so and
   offers Retry. At the recorded accessUntil the package is checked again.

   IT SHOWS; IT NEVER DECIDES. The chip is not a ribbon command, so
   OmegaCaps never hides it and it needs no catalog owner. Every figure is
   the server's. Every module state is the ONE rule the workspace's Modules
   page uses: the server's projection for a packaged workspace,
   OmegaWorkspaceHub.moduleState for a legacy one, on the tier
   OmegaWorkspaceHub.editorCtx names (the one mirror of OmegaCaps.resolve)
   so that "held" means Site Map opens it; a legacy request is in progress
   only where moduleCard says so. Showing a module is never access.

   Not built: Editor Lite hides #portal-nav, so it has no chip.

   ES5 and no dependencies at load. A legacy workspace's panel loads
   omega-tools.js and omega-workspace-hub.js on first open (both ES5, no
   side effects); omega-tenant.js is never loaded here (CLAUDE.md: its
   hostname lock is a separate change). summary() is the pure half and is
   exported for scripts/tests/teditorplan.js. */
(function (global) {
  'use strict';

  /* The legacy tier's name and level as the workspace shows them. They are
     omega-tenant.js's TIER_LABEL and TIER_LEVEL, which this page cannot
     load; teditorplan.js fails if the copies drift. Performance is the
     product name of the deluxe tier. */
  var TIER_LABEL = { trial: 'Trial', standard: 'Standard', pro: 'Pro', deluxe: 'Performance', enterprise: 'Enterprise', internal: 'Internal', partner: 'Partner' };
  var TIER_LEVEL = { trial: 3, standard: 1, pro: 2, deluxe: 2, enterprise: 3, internal: 3, partner: 2 };
  var LINKS = [{ href: '/workspace#billing', text: 'Plan & billing ›' }, { href: '/workspace#modules', text: 'Modules ›' }];
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var TEXT = {
    unchecked: 'Your plan could not be checked, so Site Map shows only what opens and views your projects. Module pricing could not be loaded either.',
    viewer: 'You can open and view projects in this workspace. An owner or administrator makes the changes.',
    readOnly: 'This workspace is read-only. Your saved projects remain available.',
    notPaid: 'Not paid yet as far as QuickBooks knows; a card payment shows within a minute.'
  };

  function has(list, k) { return Array.isArray(list) && list.indexOf(k) >= 0; }
  function byKey(rows) { var out = {}; (rows || []).forEach(function (m) { if (m && m.key) out[m.key] = m; }); return out; }
  function namesOf(rows) { var out = {}; (rows || []).forEach(function (m) { if (m && m.key) out[m.key] = m.name || m.key; }); return out; }

  /* A calendar day for a person: 'Oct 1, 2026'. A bare YYYY-MM-DD is that
     day as written (never shifted a day back by a time zone); a timestamp
     is the viewer's own calendar day. */
  function day(v) {
    if (v == null || v === '') return '';
    var m = typeof v === 'string' && /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
    if (m) return MONTHS[+m[2] - 1] ? MONTHS[+m[2] - 1] + ' ' + (+m[3]) + ', ' + m[1] : '';
    var ms = typeof v === 'number' ? v : v && typeof v.toMillis === 'function' ? v.toMillis() : v && typeof v.seconds === 'number' ? v.seconds * 1000 : Date.parse(v);
    if (!isFinite(ms)) return '';
    var d = new Date(ms);
    return MONTHS[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
  }

  /* Does a module live inside Site Map? The price list's own flag
     (api/offerings `editor`); until it has loaded, the catalog's ribbon,
     which is the same test the server's flag makes for every module sold
     today. */
  function inEditor(m, offer) {
    if (offer && typeof offer.editor === 'boolean') return offer.editor;
    return !!(m && m.ribbon && m.ribbon.length);
  }

  /* held and partly held modules into In Site Map / Elsewhere; the rest counted */
  function place(out, rows, stateOf, offers) {
    rows.forEach(function (m) {
      var st = stateOf(m);
      if (st === 'held' || st === 'part') {
        var row = { key: m.key, name: m.name || m.key, pill: st === 'part' ? 'Partly included' : '' };
        (inEditor(m, offers[m.key]) ? out.inSiteMap : out.elsewhere).push(row);
      } else out.notHeld++;
    });
    out.listed = true;
  }

  /* What a PACKAGED workspace has on its way in or out, in the contract's
     words, from the plan-change summary: a change invoice waiting for
     payment, bought but not on yet, a removal queued for the review. */
  function changes(figs, names) {
    var out = [], seen = {}, f = figs || {};
    function add(k, pill, payUrl) {
      if (!k || seen[k + '|' + pill]) return;
      seen[k + '|' + pill] = 1;
      out.push({ key: k, name: names[k] || k, pill: pill, payUrl: payUrl || null });
    }
    (f.pending || []).forEach(function (p) { (p && p.add || []).forEach(function (k) { add(k, 'Waiting for payment', p.paymentLink); }); });
    if (Array.isArray(f.subscription) && Array.isArray(f.modules)) f.subscription.forEach(function (k) { if (f.modules.indexOf(k) < 0) add(k, 'Bought · not on yet'); });
    (f.removalRequests || []).forEach(function (r) { add(r && r.module, 'Opting out'); });
    return out;
  }

  /* A LEGACY workspace's opt-in and opt-out requests, as the Modules page's
     own card reads them (OmegaWorkspaceHub.moduleCard): only ClearSky's
     package activation closes a request, so one ClearSky met by editing
     the tier stays 'requested' on the record — an opt-in on a module the
     plan now holds, an opt-out of one it no longer holds. The card calls
     those answered, and so does the chip: a module never reads Live on the
     Modules page and "Opt-in requested" here. The summary is the fresher
     record, the billing record the fallback. */
  function requests(rows, ctx, figs, billing, hub) {
    var f = figs || {}, b = billing || {}, out = [];
    var rec = { optIns: f.optIns || b.optIns || {}, optOuts: f.optOuts || b.optOuts || {} };
    function open(map, k) { return !!(map[k] && map[k].status === 'requested'); }
    rows.forEach(function (m) {
      if (!m || !m.key || !(open(rec.optIns, m.key) || open(rec.optOuts, m.key))) return;
      var card = hub.moduleCard(m, ctx, rec, null, {});
      if (card.state === 'requested' || card.state === 'removing') out.push({ key: m.key, name: m.name || m.key, pill: card.pill, payUrl: null });
    });
    return out;
  }

  /* OmegaCaps as editorCtx may read it and never write it: the rule sets
     the org and add-ons first (its mirror of resolve), and in Site Map those
     are the page's live gating state, already set by resolve from the same
     record. The chip shows; it never decides. */
  function readOnlyCaps(caps) {
    return { editorCan: caps.editorCan, can: caps.can, effectiveTier: caps.effectiveTier, INTERNAL_DOMAINS: caps.INTERNAL_DOMAINS,
      setOrg: function (email) { return caps.orgOf(email); }, setAddons: function () { return caps.addons ? caps.addons() : []; } };
  }

  /* the server's figures, as the server formatted them */
  function figures(figs) {
    if (!figs) return null;
    var unpaid = (figs.invoices || []).filter(function (i) { return i && i.state === 'unpaid' && i.paymentLink && i.kind !== 'change'; })[0];
    var f = { monthly: figs.monthlyDisplay || '', interval: figs.interval === 'annual' ? 'annual' : 'monthly', next: day(figs.nextInvoiceOn),
      due: figs.amountDue > 0 ? (figs.amountDueDisplay || '') : '', payUrl: unpaid ? unpaid.paymentLink : null };
    return (f.monthly || f.next || f.due || f.payUrl) ? f : null;
  }

  /* A packaged plan's name: the server's plan when it has one ("Field",
     "Pro"); its à la carte name says less than the count, so that one is
     spelled out from the modules the projection lists. */
  function packagedName(held, figs) {
    if (figs && figs.planDisplay && figs.planDisplay !== 'Lite + modules') return figs.planDisplay;
    var extra = held.filter(function (k) { return k !== 'lite'; }).length;
    return extra ? 'Lite + ' + extra + (extra === 1 ? ' module' : ' modules') : 'Lite';
  }

  /* Is the workspace read-only because of the BILL, or only for this
     person? The projection is read-only for either (package-access.js:
     !live || a viewer), and a notice rides along in both — a viewer on the
     last days of a live trial carries the trial's reminder — so "read-only
     with a notice" named every such viewer's plan unpaid, in red, with an
     I've paid that only answers an owner or administrator. The server's
     own `live`, when it sends it, decides. Without it: a notice with a pay
     link, or one while the recorded deadline has passed, is the bill; the
     trial's reminder has no pay link and comes only while the trial runs. */
  function billReadOnly(view, now) {
    if (!view.readOnly) return false;
    if (typeof view.live === 'boolean') return !view.live;
    var notice = view.billingNotice;
    if (!notice) return false;
    if (notice.payUrl) return true;
    return !(typeof view.accessUntil === 'number' && view.accessUntil > now);
  }

  function packaged(out, view, figs, offers, now) {
    if (view.unverified) {
      out.state = 'unchecked'; out.tone = 'warn'; out.plan = 'Plan not checked'; out.pill = 'Not checked';
      out.notice = { text: TEXT.unchecked }; out.retry = true;
      return out;
    }
    var rows = view.catalog || [];
    if (!rows.length) return out;               // the projection is on its way
    var held = view.staff ? rows.map(function (m) { return m.key; }) : (view.modules || []);
    place(out, rows, function (m) { return has(held, m.key) ? 'held' : null; }, offers);
    if (view.staff) { out.state = 'staff'; out.tone = 'ok'; out.plan = 'Staff · every module'; out.pill = 'Staff'; return out; }
    if (view.preview) { out.state = 'preview'; out.tone = 'muted'; out.plan = 'Preview · ' + packagedName(held, null); out.pill = 'Presentation preview'; return out; }
    out.plan = packagedName(held, figs);
    out.changes = changes(figs, namesOf(rows));
    out.figures = figures(figs);
    var notice = view.billingNotice;
    if (billReadOnly(view, now)) {
      out.state = 'readonly'; out.tone = 'bad'; out.suffix = ' · Read-only'; out.pill = 'Read-only';
      out.notice = { text: notice ? notice.text : TEXT.readOnly, payUrl: (notice && notice.payUrl) || null, paid: true };
    } else if (view.readOnly) {
      /* read-only while the plan is live is the person's role, not the bill:
         the server's note (the trial's reminder, an overdue Lite) is passed
         on as words, with no payment to make or confirm */
      out.state = 'viewer'; out.tone = 'muted'; out.suffix = ' · Read-only'; out.pill = 'View only';
      out.notice = { text: TEXT.viewer + (notice && notice.text ? ' ' + notice.text : '') };
    } else if (notice && notice.payUrl) {
      /* still working, but overdue: Lite is what is left (past_due_lite) */
      out.state = 'due'; out.tone = 'warn'; out.suffix = ' · Payment due'; out.pill = 'Payment due';
      out.notice = { text: notice.text, payUrl: notice.payUrl, paid: true };
    } else {
      out.state = 'live'; out.tone = 'ok'; out.pill = 'Live';
      if (notice) out.notice = { text: notice.text };   // the trial's last days
    }
    return out;
  }

  function legacy(out, input, figs, offers) {
    var eff = String(input.tier || '').toLowerCase(), caps = input.caps, hub = input.hub, rows = input.offerings && input.offerings.modules;
    var libs = !!(hub && input.tools && caps && rows);
    if (eff === 'internal') {
      out.state = 'staff'; out.tone = 'ok'; out.plan = 'Staff · every module'; out.pill = 'Staff';
      if (rows) place(out, rows, function () { return 'held'; }, offers);
      return out;
    }
    if (!input.billing) return out;             // the billing record is on its way
    /* A record that could not be read names the tier Site Map is running;
       one without a tier is Standard, as the workspace reads it. */
    var b = input.billing.failed ? null : input.billing;
    var billed = b ? String(b.tier || 'standard').toLowerCase() : eff;
    var label = function (t) { return TIER_LABEL[t] || (t ? t.charAt(0).toUpperCase() + t.slice(1) : 'Standard'); };
    out.state = 'legacy'; out.tone = 'ok'; out.plan = label(billed); out.pill = billed === 'trial' ? 'Trial' : 'Live';
    if (billed === 'trial' && b && b.trialEndsAt && day(b.trialEndsAt)) out.notice = { text: 'Your trial ends on ' + day(b.trialEndsAt) + '.' };
    /* Which tier Site Map runs for this record and person: the ONE mirror
       of OmegaCaps.resolve (OmegaWorkspaceHub.editorCtx) that the Modules
       page asks too, so both judge a module on the same tier — a legacy
       trial is not Enterprise for a module with nothing to count. A record
       that could not be read leaves the tier Site Map is running. */
    var who = input.who || {}, e = null;
    if (b && hub && hub.editorCtx && caps && caps.orgOf) e = hub.editorCtx(readOnlyCaps(caps), b, { email: who.email || '', emailVerified: who.emailVerified === true, orgId: input.org || '' });
    if (!e && caps && caps.editorCan && caps.can) e = { tier: eff, ungated: caps.can(eff, 'all') === true, editorCan: function (c) { return caps.editorCan(eff, c); } };
    var site = e ? e.tier : eff;
    /* capTier: the plan is billed at one tier and Site Map scoped below it */
    if (b && b.tier && caps && caps.normalise && caps.normalise(b.tier) !== caps.normalise(site) && caps.LADDER && caps.LADDER.indexOf(caps.normalise(site)) >= 0) {
      out.note = 'Site Map is set to ' + label(caps.normalise(site)) + ' on this workspace.';
    }
    out.figures = figures(figs);
    /* nothing is listed, requests included, until the module states are known */
    if (!libs) return out;
    /* the Modules page's own rule (OmegaWorkspaceHub.moduleState): a module
       is held when its tools open on this plan AND Site Map grants its
       capabilities on the tier editorCtx names */
    var level = TIER_LEVEL[billed] != null ? TIER_LEVEL[billed] : 1;
    var ws = { orgId: input.org || '', tierLevel: level, addons: (b && b.addons) || [] };
    if (b && b.toolOverrides) ws.toolOverrides = b.toolOverrides;
    if (b && Array.isArray(b.toolAccess)) ws.toolAccess = b.toolAccess;   // absent ≠ empty
    var tools = input.tools, ctx = { packaged: false, tierLevel: level, addons: ws.addons, modules: [],
      canOpen: function (k) { var t = tools.byKey(k); return !!t && tools.isUnlocked(t, ws); },
      tool: function (k) { return tools.byKey(k); } };
    if (e) { ctx.editorCan = e.editorCan; ctx.ungated = e.ungated; ctx.editorTier = e.tier; }
    place(out, rows, function (m) { return hub.moduleState(m, ctx); }, offers);
    if (hub.moduleCard) out.changes = requests(rows, ctx, figs, b, hub);
    return out;
  }

  /* ── WHAT THE CHIP AND ITS PANEL SAY ─────────────────────────────────
     input = { view (OmegaCaps.packageAccess()), tier (the legacy tier Site
     Map is running), billing (a legacy billing/current record, {} when
     there is none, {failed:true} when it could not be read), offerings
     (GET /api/offerings), figures (GET /api/plan-change, or {error}),
     hub, tools, caps (the runtime libraries), org, who ({ email,
     emailVerified } of the person Site Map resolved for), now (ms) }.
     Pure: OmegaCaps is only read. */
  function summary(input) {
    input = input || {};
    var view = input.view && input.view.packaged === true ? input.view : null;
    var figs = input.figures && !input.figures.error ? input.figures : null;
    var offers = byKey(input.offerings && input.offerings.modules);
    var out = { state: 'checking', tone: 'muted', plan: '', suffix: '', pill: '', notice: null, note: '', figures: null,
      inSiteMap: [], elsewhere: [], changes: [], notHeld: 0, listed: false, retry: false, links: LINKS.slice() };
    if (view) return packaged(out, view, figs, offers, typeof input.now === 'number' ? input.now : Date.now());
    if (input.tier) return legacy(out, input, figs, offers);
    return out;
  }

  var API = { summary: summary, day: day, inEditor: inEditor, TIER_LABEL: TIER_LABEL, TIER_LEVEL: TIER_LEVEL, LINKS: LINKS, TEXT: TEXT };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (!global || !global.document) return;
  global.OmegaEditorPlan = API;

  /* ═════════════════════ the browser half ═════════════════════ */
  var doc = global.document;
  var S = { user: null, view: null, tier: null, billing: null, offerings: null, figures: null, figuresAt: 0,
    loading: {}, busy: '', message: '', open: false, deadline: null, timer: null, libs: null, fixed: null, queued: false };

  function caps() { return global.OmegaCaps || null; }
  function currentUser() {
    try { return global.firebase && global.firebase.apps && global.firebase.apps.length ? global.firebase.auth().currentUser : null; } catch (e) { return null; }
  }
  /* Customer Editor Lite's drawing engine is an iframe with no plan of its own */
  function engineOnly() { try { return new URLSearchParams(global.location.search).get('customerEngine') === '1'; } catch (e) { return false; } }
  function el(tag, cls, text) { var n = doc.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function link(href, text, cls) { var a = el('a', cls, text); a.href = href; a.target = '_blank'; a.rel = 'noopener'; return a; }
  function button(text, fn, cls) { var b = el('button', cls || 'oep-btn', text); b.type = 'button'; b.onclick = fn; return b; }

  /* what OmegaCaps has decided so far, and a fresh start for another person */
  function sync() {
    var C = caps(), u = currentUser(), who = u ? (u.uid || u.email || 'user') : '';
    if (who !== S.user) { S.user = who; S.billing = null; S.figures = null; S.figuresAt = 0; S.message = ''; S.busy = ''; }
    S.view = u && C && C.packageAccess ? C.packageAccess() : null;
    S.tier = u && !S.view && doc.body ? doc.body.getAttribute('data-tier') : null;
  }
  function authed(path, body) {
    var u = currentUser();
    if (!u || !u.getIdToken || !global.fetch) return Promise.reject(new Error('Sign in to continue'));
    return u.getIdToken().then(function (token) {
      var opts = { cache: 'no-store', headers: { Authorization: 'Bearer ' + token } };
      if (body) { opts.method = 'POST'; opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
      return global.fetch(path, opts);
    }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j || {} }; }, function () { return { ok: r.ok, body: {} }; }); });
  }
  function once(key, work) {
    if (S.loading[key]) return;
    S.loading[key] = true;
    var who = S.user;
    work().then(null, function () {}).then(function () { S.loading[key] = false; if (who === S.user) paint(); });
  }
  function loadBilling() {
    var C = caps(), org = C && C.org ? C.org() : '', who = S.user;
    once('billing', function () {
      if (!org || !global.firebase || !global.firebase.firestore) { S.billing = { failed: true }; return Promise.resolve(); }
      return global.firebase.firestore().collection('omega_orgs').doc(org).collection('billing').doc('current').get()
        .then(function (s) { if (who === S.user) S.billing = s.exists ? (s.data() || {}) : {}; }, function () { if (who === S.user) S.billing = { failed: true }; });
    });
  }
  /* any verified member may read the summary; a 403 or a 503 (the price
     book not seeded yet) leaves the plan without figures, and says nothing */
  function loadFigures() {
    var who = S.user;
    once('figures', function () {
      return authed('/api/plan-change').then(function (r) { if (who === S.user) { S.figures = r.ok ? r.body : { error: true }; S.figuresAt = Date.now(); } },
        function () { if (who === S.user) { S.figures = { error: true }; S.figuresAt = Date.now(); } });
    });
  }
  function loadOfferings() {
    once('offerings', function () {
      if (!global.fetch) { S.offerings = { error: true }; return Promise.resolve(); }
      return global.fetch('/api/offerings').then(function (r) { return r.ok ? r.json() : { error: true }; })
        .then(function (j) { S.offerings = j && Array.isArray(j.modules) ? j : { error: true }; }, function () { S.offerings = { error: true }; });
    });
  }
  function script(src, ready) {
    return new Promise(function (done) {
      if (ready()) return done();
      var s = doc.createElement('script'); s.src = src; s.async = true;
      s.onload = s.onerror = function () { done(); };
      (doc.head || doc.body).appendChild(s);
    });
  }
  /* the legacy rule's libraries, on first open only */
  function loadLibs() {
    if (S.libs) return;
    S.libs = Promise.all([
      script('/omega-tools.js', function () { return !!global.OMEGATools; }),
      script('/omega-workspace-hub.js', function () { return !!global.OmegaWorkspaceHub; })
    ]).then(function () { paint(); });
  }
  function want() {
    if (S.fixed) return;
    var v = S.view, live = v && v.catalog && v.catalog.length && !v.staff && !v.preview && !v.unverified;
    if (S.tier && !S.view && S.tier !== 'internal' && !S.billing) loadBilling();
    if (live && !S.figures) loadFigures();
    if (!S.open) return;
    if (!S.offerings) loadOfferings();
    if (S.tier && !S.view) { loadLibs(); if (!S.figures) loadFigures(); }
    if ((live || S.tier) && S.figures && Date.now() - S.figuresAt > 60000) { S.figures = null; loadFigures(); }
  }
  function inputs() {
    var C = caps(), u = currentUser();
    return { view: S.view, tier: S.tier, billing: S.billing, offerings: S.offerings && !S.offerings.error ? S.offerings : null, figures: S.figures,
      hub: global.OmegaWorkspaceHub || null, tools: global.OMEGATools || null, caps: C, org: C && C.org ? C.org() : '',
      who: u ? { email: u.email || '', emailVerified: u.emailVerified === true } : null };
  }

  /* ── The package again, without a reload: after "I've paid", at the
     access deadline, and on Retry. A failed fetch leaves the plan unchecked
     (OmegaCaps), which keeps viewing and withholds producing. */
  function refreshPackage() {
    var C = caps(), u = currentUser();
    if (!C || !C.fetchPackage || !u) return Promise.resolve();
    return C.fetchPackage(u).then(function (v) { C.apply(v.tier || 'standard'); }, function () { C.apply('trial'); });
  }
  function paid() {
    S.busy = 'paid'; S.message = ''; paint();
    authed('/api/plan-change', { action: 'reconcile-now' }).then(function (r) {
      var j = r.body || {};
      if (r.ok && j.paid) { S.message = 'Paid. Your tools are back.'; return refreshPackage(); }
      S.message = j.error || TEXT.notPaid;
    }, function () { S.message = 'QuickBooks could not be reached; try again in a moment.'; })
      .then(function () { S.busy = ''; S.figures = null; S.figuresAt = 0; paint(); });
  }
  function retry() {
    var C = caps(), u = currentUser();
    if (S.busy === 'retry' || !C || !C.retry || !u || !global.firebase || !global.firebase.firestore) return;
    S.busy = 'retry'; S.message = ''; paint();
    C.retry(global.firebase.firestore(), u.email, u.emailVerified).then(null, function () {}).then(function () {
      S.busy = ''; S.billing = null; S.figures = null; S.figuresAt = 0;
      var v = C.packageAccess();
      S.message = v && v.unverified ? 'Still could not check your plan. Try again in a moment.' : '';
      paint();
    });
  }
  /* the recorded access deadline, if it falls while Site Map is open: close
     the presentation first, as omega-tenant.js does on its pages, then ask
     the server again. The API and rules enforce the deadline on their own. */
  function arm(view) {
    var at = view && !view.readOnly && !view.staff && !view.preview && typeof view.accessUntil === 'number' ? view.accessUntil : null;
    if (at === S.deadline) return;
    if (S.timer) clearTimeout(S.timer);
    S.timer = null; S.deadline = at;
    var wait = at == null ? 0 : at - Date.now();
    if (at == null || wait <= 0 || wait > 2147483000) return;
    S.timer = setTimeout(function () {
      /* whatever projection is current, as long as it still carries this deadline */
      var C = caps(), now = C && C.packageAccess();
      S.timer = null; S.deadline = null;
      if (!now || now.accessUntil !== at || now.readOnly || now.staff || now.preview) return;
      now.readOnly = true; C.setPackage(now); C.apply('standard');
      refreshPackage().then(paint);
    }, wait + 250);
  }

  /* ── drawing ── */
  function styles() {
    if (doc.getElementById('omega-plan-style')) return;
    var s = el('style'); s.id = 'omega-plan-style';
    /* the editor's own tokens (light and dark, and the Appearance switch);
       the fallbacks are the light values, for a page without them */
    s.textContent =
      '#omega-plan{display:flex;align-items:center;min-width:0;flex:0 1 auto}#omega-plan[hidden]{display:none}' +
      '.oep-chip{display:inline-flex;align-items:center;gap:6px;min-width:0;max-width:min(360px,48vw);height:24px;margin:0;padding:0 9px 0 8px;border:1px solid var(--border,#CBD3DB);border-radius:999px;background:var(--panel,#fff);color:var(--text,#16202B);font:600 11px/1 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;cursor:pointer;white-space:nowrap;text-shadow:none}' +
      '.oep-chip:hover,.oep-chip[aria-expanded="true"]{background:var(--hover-strong,rgba(22,32,43,.1))}' +
      '.oep-chip:focus-visible,#omega-plan-pop :focus-visible{outline:2px solid var(--accent,#2B5FA8);outline-offset:2px}' +
      '.oep-dot{width:7px;height:7px;border-radius:50%;flex:none;background:var(--sub,#4A5B6C)}' +
      '[data-tone="ok"]>.oep-dot{background:var(--ok,#2E7D4F)}[data-tone="warn"]>.oep-dot{background:var(--warn,#9A6B00)}[data-tone="bad"]>.oep-dot{background:var(--bad,#B3382E)}' +
      '.oep-k{color:var(--sub,#4A5B6C);font-size:9px;letter-spacing:.08em;text-transform:uppercase}' +
      '.oep-v{overflow:hidden;text-overflow:ellipsis;min-width:0}.oep-s{flex:none;font-weight:700}.oep-caret{flex:none;color:var(--sub,#4A5B6C);font-size:9px}' +
      '@media (max-width:560px){.oep-k,.oep-caret{display:none}.oep-chip{max-width:60vw}}' +
      '#omega-plan-pop{position:fixed;z-index:100000;box-sizing:border-box;max-height:calc(100vh - 56px);overflow:auto;overscroll-behavior:contain;margin:0;padding:16px 16px 12px;background:var(--panel,#fff);color:var(--text,#16202B);border:1px solid var(--border,#CBD3DB);border-radius:12px;box-shadow:var(--shadow,0 10px 30px rgba(22,32,43,.18));font:13px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;text-align:left;text-shadow:none}' +
      '#omega-plan-pop *{box-sizing:border-box}#omega-plan-pop p{margin:0}#omega-plan-pop:focus{outline:none}' +
      '.oep-top{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}' +
      '.oep-eyebrow{font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--sub,#4A5B6C)}' +
      '.oep-name{margin-top:2px;font-size:19px;font-weight:700;line-height:1.25;overflow-wrap:anywhere}' +
      '.oep-x{flex:none;width:28px;height:28px;margin:-4px -6px 0 0;border:0;border-radius:7px;background:transparent;color:var(--sub,#4A5B6C);font:400 18px/1 system-ui,sans-serif;cursor:pointer}.oep-x:hover{background:var(--hover,rgba(22,32,43,.05));color:var(--text,#16202B)}' +
      '.oep-pill{display:inline-flex;align-items:center;gap:6px;margin-top:8px;padding:3px 10px 3px 8px;border-radius:999px;background:var(--surface,#EEF1F3);color:var(--text,#16202B);font-size:11px;font-weight:700}' +
      '.oep-notice{margin-top:12px;padding:10px 12px;border:1px solid var(--border,#CBD3DB);border-left:3px solid var(--sub,#4A5B6C);border-radius:9px;background:var(--panel,#fff)}' +
      '.oep-notice[data-tone="bad"]{border-left-color:var(--bad,#B3382E)}.oep-notice[data-tone="warn"]{border-left-color:var(--warn,#9A6B00)}.oep-notice[data-tone="ok"]{border-left-color:var(--ok,#2E7D4F)}' +
      '.oep-acts{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}' +
      '.oep-btn{display:inline-flex;align-items:center;min-height:30px;margin:0;padding:0 12px;border:1px solid var(--accent-2,#33629F);border-radius:7px;background:transparent;color:var(--accent-2,#33629F);font:700 12px/1.2 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;text-decoration:none;cursor:pointer}' +
      '.oep-btn:hover{background:var(--hover,rgba(22,32,43,.05))}.oep-btn[disabled]{cursor:progress}' +
      '.oep-msg{margin-top:8px!important;font-size:12px;color:var(--sub,#4A5B6C)}.oep-note{margin-top:10px!important;font-size:12px;color:var(--sub,#4A5B6C)}' +
      '.oep-figs{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:12px}.oep-fig.oep-wide{grid-column:1/-1}' +
      '.oep-fig{min-width:0;padding:9px 10px;border-radius:9px;background:var(--surface,#EEF1F3)}.oep-fig b{display:block;font-size:15px;line-height:1.25;overflow-wrap:anywhere}.oep-fig span{display:block;margin-top:3px;font-size:11px;color:var(--sub,#4A5B6C)}' +
      '.oep-pay{margin-top:8px}' +
      '.oep-sec{margin-top:14px}.oep-sec h4{margin:0;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--sub,#4A5B6C)}' +
      '.oep-hint{margin:1px 0 7px!important;font-size:11px;color:var(--sub,#4A5B6C)}' +
      '.oep-mods{display:flex;flex-wrap:wrap;gap:6px}' +
      '.oep-mod{display:inline-flex;align-items:center;gap:6px;max-width:100%;padding:4px 9px;border:1px solid var(--border,#CBD3DB);border-radius:7px;background:var(--surface,#EEF1F3);color:var(--text,#16202B);font-size:12px;font-weight:600;text-decoration:none}' +
      '.oep-mod:hover{border-color:var(--accent-2,#33629F)}.oep-mod i{font-style:normal;font-size:10px;font-weight:600;color:var(--sub,#4A5B6C)}' +
      '.oep-changes{display:grid;gap:6px;margin:6px 0 0;padding:0;list-style:none}.oep-changes li{display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px;font-size:12px}' +
      '.oep-changes b{font-weight:600}.oep-changes a{color:var(--accent-2,#33629F);font-weight:700}' +
      '.oep-tag{display:inline-flex;padding:1px 8px;border-radius:999px;background:var(--surface,#EEF1F3);color:var(--text,#16202B);font-size:11px;font-weight:600}' +
      '.oep-more{margin-top:14px!important;font-size:12px;color:var(--sub,#4A5B6C)}' +
      '.oep-links{display:flex;flex-wrap:wrap;gap:6px 18px;margin-top:10px;padding-top:10px;border-top:1px solid var(--hairline,rgba(22,32,43,.08))}' +
      '.oep-links a{color:var(--accent-2,#33629F);font-size:13px;font-weight:700;text-decoration:none}.oep-links a:hover{text-decoration:underline}';
    (doc.head || doc.body).appendChild(s);
  }

  function drawChip(host, model) {
    var chip = doc.getElementById('omega-plan-chip');
    if (model.state === 'checking') { host.hidden = true; if (S.open) close(); return; }
    host.hidden = false;
    if (!chip) {
      chip = el('button', 'oep-chip'); chip.id = 'omega-plan-chip'; chip.type = 'button';
      chip.setAttribute('aria-haspopup', 'dialog'); chip.setAttribute('aria-expanded', 'false'); chip.setAttribute('aria-controls', 'omega-plan-pop');
      chip.appendChild(el('span', 'oep-dot')); chip.appendChild(el('span', 'oep-k', 'Plan'));
      chip.appendChild(el('span', 'oep-v')); chip.appendChild(el('span', 'oep-s')); chip.appendChild(el('span', 'oep-caret', '▾'));
      chip.onclick = function () { if (S.open) close(); else open(); };
      host.appendChild(chip);
    }
    chip.setAttribute('data-state', model.state); chip.setAttribute('data-tone', model.tone);
    chip.querySelector('.oep-v').textContent = model.plan;
    chip.querySelector('.oep-s').textContent = model.suffix;
    chip.title = 'Your plan: ' + model.plan + model.suffix + '. Modules and billing.';
    chip.setAttribute('aria-label', chip.title);
  }

  function modSection(pop, title, hint, rows, cls) {
    var sec = el('section', 'oep-sec ' + cls);
    sec.appendChild(el('h4', '', title));
    if (hint) sec.appendChild(el('p', 'oep-hint', hint));
    var list = el('div', 'oep-mods');
    rows.forEach(function (r) {
      /* each module opens its card on the workspace's Modules page */
      var a = link('/workspace#module-' + encodeURIComponent(r.key), '', 'oep-mod');
      a.setAttribute('data-plan-module', r.key);
      a.appendChild(doc.createTextNode(r.name));
      if (r.pill) a.appendChild(el('i', '', r.pill));
      list.appendChild(a);
    });
    sec.appendChild(list);
    pop.appendChild(sec);
  }

  function drawPanel(model) {
    var pop = doc.getElementById('omega-plan-pop');
    if (!pop) return;
    /* redrawn whole when an answer lands: keep the scroll and the focus */
    var scroll = pop.scrollTop, focused = pop.contains(doc.activeElement) && doc.activeElement !== pop ? (doc.activeElement.id || '') : null;
    pop.textContent = '';
    pop.setAttribute('data-state', model.state);
    var top = el('div', 'oep-top'), head = el('div');
    head.appendChild(el('div', 'oep-eyebrow', 'Your plan'));
    head.appendChild(el('div', 'oep-name', model.plan));
    if (model.pill) { var pill = el('span', 'oep-pill'); pill.setAttribute('data-tone', model.tone); pill.appendChild(el('span', 'oep-dot')); pill.appendChild(doc.createTextNode(model.pill)); head.appendChild(pill); }
    top.appendChild(head);
    var x = button('×', function () { close(true); }, 'oep-x'); x.setAttribute('aria-label', 'Close'); top.appendChild(x);
    pop.appendChild(top);

    if (model.notice) {
      var n = el('div', 'oep-notice'); n.setAttribute('data-tone', model.tone); n.setAttribute('role', 'status');
      n.appendChild(el('p', 'oep-notice-text', model.notice.text));
      var acts = el('div', 'oep-acts');
      if (model.notice.payUrl) acts.appendChild(link(model.notice.payUrl, 'Pay in QuickBooks', 'oep-btn oep-pay-link'));
      if (model.notice.paid) { var b = button(S.busy === 'paid' ? 'Checking QuickBooks…' : "I've paid", paid); b.id = 'omega-plan-paid'; b.disabled = S.busy === 'paid'; acts.appendChild(b); }
      if (model.retry) { var r = button(S.busy === 'retry' ? 'Checking…' : 'Retry', retry); r.id = 'omega-plan-retry'; r.disabled = S.busy === 'retry'; acts.appendChild(r); }
      if (acts.children.length) n.appendChild(acts);
      if (S.message && !S.fixed) n.appendChild(el('p', 'oep-msg', S.message));
      pop.appendChild(n);
    } else if (S.message && !S.fixed) {
      /* the answer to I've paid or Retry, after the notice it answered has gone */
      var said = el('p', 'oep-msg', S.message); said.setAttribute('role', 'status'); pop.appendChild(said);
    }

    var f = model.figures;
    if (f) {
      var figs = el('div', 'oep-figs');
      /* two to a row; of three, the plan's own figure takes the first row */
      var shown = [f.monthly, f.next, f.due].filter(Boolean).length;
      var fig = function (value, label, wide) { var d = el('div', 'oep-fig' + (wide ? ' oep-wide' : '')); d.appendChild(el('b', '', value)); d.appendChild(el('span', '', label)); figs.appendChild(d); };
      if (f.monthly) fig(f.monthly, f.interval === 'annual' ? 'Your plan, billed yearly' : 'Your plan', shown !== 2);
      if (f.next) fig(f.next, 'Next invoice', shown === 1);
      if (f.due) fig(f.due, 'Due now', shown === 1);
      pop.appendChild(figs);
      if (f.payUrl && !(model.notice && model.notice.payUrl)) { var pay = el('div', 'oep-acts oep-pay'); pay.appendChild(link(f.payUrl, 'Pay in QuickBooks', 'oep-btn oep-pay-link')); pop.appendChild(pay); }
    }
    if (model.note) pop.appendChild(el('p', 'oep-note', model.note));

    if (model.listed) {
      modSection(pop, 'In Site Map', 'Modules that work inside this editor.', model.inSiteMap, 'oep-insite');
      if (model.elsewhere.length) modSection(pop, 'Elsewhere', 'Held on your plan, used outside Site Map.', model.elsewhere, 'oep-elsewhere');
    } else if (model.state !== 'unchecked') {
      var busy = S.loading.offerings || S.loading.figures || (S.libs && !(global.OMEGATools && global.OmegaWorkspaceHub));
      pop.appendChild(el('p', 'oep-note', busy ? 'Checking what your plan holds…' : 'What your plan holds is on the Modules page.'));
    }

    if (model.changes.length) {
      var sec = el('section', 'oep-sec oep-changing'); sec.appendChild(el('h4', '', 'Changes in progress'));
      var ul = el('ul', 'oep-changes');
      model.changes.forEach(function (c) {
        var li = el('li'); li.appendChild(el('b', '', c.name)); li.appendChild(el('span', 'oep-tag', c.pill));
        if (c.payUrl) li.appendChild(link(c.payUrl, 'Pay in QuickBooks'));
        ul.appendChild(li);
      });
      sec.appendChild(ul); pop.appendChild(sec);
    }

    if (model.notHeld) pop.appendChild(el('p', 'oep-more', model.notHeld + (model.notHeld === 1 ? ' more module' : ' more modules') + ' available.'));
    var links = el('div', 'oep-links');
    model.links.forEach(function (l) { links.appendChild(link(l.href, l.text)); });
    pop.appendChild(links);
    pop.scrollTop = scroll;
    if (focused !== null) { var again = (focused && doc.getElementById(focused)) || pop.querySelector('.oep-x'); if (again && again.focus) again.focus(); }
    position();
  }

  function position() {
    var pop = doc.getElementById('omega-plan-pop'), chip = doc.getElementById('omega-plan-chip');
    if (!pop) return;
    var vw = global.innerWidth || doc.documentElement.clientWidth, w = Math.min(380, vw - 16);
    var r = chip && chip.getBoundingClientRect ? chip.getBoundingClientRect() : { bottom: 40, right: vw - 8 };
    pop.style.width = w + 'px';
    pop.style.top = Math.round(Math.max(8, r.bottom + 6)) + 'px';
    pop.style.left = Math.round(Math.min(Math.max(8, r.right - w), vw - w - 8)) + 'px';
  }

  function outside(e) {
    var pop = doc.getElementById('omega-plan-pop'), chip = doc.getElementById('omega-plan-chip'), t = e.target;
    if (pop && pop.contains(t)) return;
    if (chip && chip.contains(t)) return;
    close();
  }
  function onKey(e) { if (e.key === 'Escape' && S.open) { e.preventDefault(); close(true); } }

  function open() {
    if (engineOnly()) return false;
    styles();
    var host = doc.getElementById('omega-plan');
    if (!host) return false;
    S.open = true;
    if (!doc.getElementById('omega-plan-pop')) {
      var pop = el('div'); pop.id = 'omega-plan-pop'; pop.tabIndex = -1;
      pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'Your plan');
      doc.body.appendChild(pop);
      doc.addEventListener('mousedown', outside, true);
      doc.addEventListener('touchstart', outside, true);
      doc.addEventListener('keydown', onKey);
      global.addEventListener('resize', position);
    }
    paint();
    var chip = doc.getElementById('omega-plan-chip');
    if (chip) chip.setAttribute('aria-expanded', 'true');
    /* focus the panel itself: Tab reaches its controls, Escape closes it */
    var panel = doc.getElementById('omega-plan-pop');
    if (panel && panel.focus) panel.focus();
    return true;
  }
  function close(refocus) {
    var pop = doc.getElementById('omega-plan-pop');
    S.open = false; S.message = '';
    if (pop) pop.parentNode.removeChild(pop);
    doc.removeEventListener('mousedown', outside, true);
    doc.removeEventListener('touchstart', outside, true);
    doc.removeEventListener('keydown', onKey);
    global.removeEventListener('resize', position);
    var chip = doc.getElementById('omega-plan-chip');
    if (chip) { chip.setAttribute('aria-expanded', 'false'); if (refocus && chip.focus) chip.focus(); }
  }

  function paint() {
    if (engineOnly()) return;
    var host = doc.getElementById('omega-plan');
    if (!host) return;
    styles();
    if (!S.fixed) { sync(); want(); arm(S.view); }
    var model = summary(S.fixed || inputs());
    drawChip(host, model);
    if (S.open) drawPanel(model);
  }
  /* coalesced: OmegaCaps announces from inside apply(), and one pass after
     it has finished is enough */
  function schedule() {
    if (S.queued) return;
    S.queued = true;
    setTimeout(function () { S.queued = false; paint(); }, 0);
  }

  /* A fixed input, no network: for the chrome render checks (the theme
     fixture draws the panel from a server projection this way). */
  function show(input) { S.fixed = input || null; paint(); if (S.fixed) open(); }

  API.paint = paint; API.open = open; API.close = close; API.show = show; API.retry = retry; API.paid = paid;
  API.model = function () { return summary(S.fixed || inputs()); };

  /* the package changed (modules, read-only, staff, unchecked): what the
     summary says may have changed with it */
  doc.addEventListener('omega:package', function () { S.figures = null; S.figuresAt = 0; schedule(); });
  doc.addEventListener('omega:tier', schedule);
  /* The editor gate let this person in (its own Retry after a blip, or a
     first read that worked where OmegaCaps' failed): a plan OmegaCaps left
     UNCHECKED is asked again here, through the chip's own Retry so its busy
     state and answer read the same. Without it the gate lifted onto a
     view-only Site Map and a second Retry on the chip. */
  global.addEventListener('omega:editor-access', function () {
    var C = caps(), p = C && C.packageAccess ? C.packageAccess() : null;
    if (engineOnly() || S.fixed || S.busy === 'retry' || !C || !C.retry) return;
    if ((C.unchecked && C.unchecked()) || (p && p.unverified)) retry();
  });
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', schedule); else schedule();
})(typeof window !== 'undefined' ? window : this);
