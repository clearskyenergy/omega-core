/* ══════════════════════════════════════════════════════════════════════════
   CLEARSKY-OMEGA · REFERRAL INBOX  (omega-referrals.js)
   -----------------------------------------------------
   SHARED PLATFORM FILE — byte-identical across every tenant repo. Contains no
   customer name, domain, logo or colour; the tenant is read at runtime from
   OMEGA_WORKSPACE, exactly like omega-brand.js and omega-terms.js do it.

   WHAT THIS IS
   A quote-request intake, mounted as a dashboard block on index.html.

   Someone on the platform — a ClearSky admin, a developer, a partner — has a
   site and wants a price on storage for it. They send a referral. It lands
   here, in the receiving tenant's dashboard, with the site, the ask, and the
   documents attached: site map, scope of work, bill of materials. The tenant
   opens it, reads it, and follows up. That is the whole loop.

   Referrals are addressed by `toOrgId`, NOT by the sender's org. That is what
   makes them cross-tenant: a fenecon.com user sees every referral sent TO
   fenecon.com regardless of who sent it, and sees nothing else. The Firestore
   rule at the foot of this file is what actually enforces that — the client
   scope is a convenience.

   THE MATRIX
   Referrals carry the same two scores the portfolio matrix uses: how good the
   grid connection is, and how likely the project is to get funded. A referral
   with both scores gets a square. The corner where both are high is where the
   quotes worth chasing are. Referrals missing a score can't be placed and are
   listed separately, because a site nobody has scored yet is not the same as a
   site that scored badly and pretending otherwise loses real projects.

   ⚠ TWO DEPLOY STEPS. See the foot of this file:
       1. The Firestore rule for /referrals — without it, reads are denied and
          the block renders empty with an error line.
       2. The Storage rule for /referrals/** — without it, uploads fail. Link
          attachments (Drive, SharePoint, anything with a URL) still work, so
          the block degrades to links-only rather than breaking.
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  /* ── Tenant-tunable knobs ──────────────────────────────────────────────
     Override any of these from config.js:

       window.CLEARSKY_CONFIG.referrals = {
         scoreNames: { grid: 'Grid Atlas', bankable: 'OGI' },
         market: 'tight',
         maxUploadMb: 25
       };

     Everything has a working default, so the block runs with no config at
     all. */
  var DEFAULTS = {
    /* Where the scores come from. These are product names in the source
       system; they appear in the "missing" column so the tenant knows who to
       chase. Set to null to fall back to the generic score labels. */
    scoreNames: { grid: 'Grid Atlas', bankable: 'OGI' },

    /* How big the good corner is. tightest = 4x4, tight = 5x5, open = 6x6.
       This is the "Buyer's market" selector in the portfolio matrix. */
    market: 'tight',

    /* Upload ceiling, MB. A site map PDF is usually 2–8MB; a BOM export is
       under 1. 25 is generous and still refuses someone's drone footage. */
    maxUploadMb: 25,

    /* Who may send a referral from this deployment. 'any' = every signed-in
       user; 'admin' = ClearSky staff only (adminDomains in config.js). */
    canRefer: 'any',

    /* Shows a "Load demo data" button in the empty state, which writes a
       realistic portfolio and inbox in one click. OFF unless a tenant turns it
       on, so a live customer can never see it — and turn it off again once the
       trial converts, or somebody will eventually click it on real data.
       It refuses to run a second time if seeded records already exist. */
    demoSeed: false
  };

  var MARKET_FLOOR = { tightest: 60, tight: 50, open: 40 };

  /* Lifecycle. `open` is the working set — everything the tenant still owes
     an answer on. */
  var STATUS = [
    { key: 'new',       label: 'New',              open: true,  tone: 'blue'  },
    { key: 'reviewing', label: 'Reviewing',        open: true,  tone: 'blue'  },
    { key: 'quoting',   label: 'Preparing quote',  open: true,  tone: 'amber' },
    { key: 'quoted',    label: 'Quote sent',       open: true,  tone: 'teal'  },
    { key: 'won',       label: 'Won',              open: false, tone: 'green' },
    { key: 'lost',      label: 'Lost',             open: false, tone: 'grey'  },
    { key: 'declined',  label: 'Declined',         open: false, tone: 'grey'  }
  ];

  /* What a referral can carry. Kind drives nothing but the label and the
     sort order — the point is that the tenant can see at a glance whether the
     BOM is actually attached before they open it. */
  var DOC_KIND = [
    { key: 'sitemap', label: 'Site map' },
    { key: 'scope',   label: 'Scope of work' },
    { key: 'bom',     label: 'Bill of materials' },
    { key: 'oneline', label: 'One-line diagram' },
    { key: 'bill',    label: 'Utility bill' },
    { key: 'quote',   label: 'Quote / pricing' },
    { key: 'other',   label: 'Other' }
  ];

  var ACCEPT = '.pdf,.png,.jpg,.jpeg,.xlsx,.xls,.csv,.docx,.dwg,.dxf';

  /* FENECON quotes in both, being a German manufacturer with a US arm. The
     symbol is stored on the quote rather than assumed, so a EUR quote does not
     render as dollars on somebody else's screen. */
  var CURRENCY = { USD: '$', EUR: '\u20AC', GBP: '\u00A3' };

  /* ════════════════════════════════════════════════════════════════════════
     CONFIG / IDENTITY
     ════════════════════════════════════════════════════════════════════════ */

  function cfg() {
    var c = (global.CLEARSKY_CONFIG && global.CLEARSKY_CONFIG.referrals) || {};
    return {
      scoreNames:  c.scoreNames  || DEFAULTS.scoreNames,
      market:      c.market      || DEFAULTS.market,
      maxUploadMb: c.maxUploadMb || DEFAULTS.maxUploadMb,
      canRefer:    c.canRefer    || DEFAULTS.canRefer,
      demoSeed:    c.demoSeed === true,
      enabled:     enabledHere(c)
    };
  }

  /* ── WHOSE DASHBOARD IS THIS ───────────────────────────────────────────
     An inbox of quote requests is the OEM and technology channel's daily
     work: somebody with a site wants a price, and the whole commercial loop
     starts here. It is not a developer's block — a developer SENDS these.

     So the default follows the vertical, the same way omega-assets.js does
     for the owner block. The two are opposites and a tenant should normally
     see one of them: developers own assets and send referrals; OEMs receive
     referrals and quote them.

     AN EXPLICIT SETTING WINS EITHER WAY. referrals.enabled true mounts it on
     any vertical — a developer who also distributes says so once — and false
     removes it from an OEM. Only the default moved.

     A tenant whose vertical is not set yet gets it, because that is how it
     behaved before this gate existed and nobody should lose an inbox they
     are already working out of. */
  var RECEIVING_VERTICALS = { oem: 1, epc: 1, installer: 1 };

  /* THREE ANSWERS, NOT TWO. "Not this tenant's block" and "the workspace has
     not resolved yet" are different, and collapsing them mounted this on
     every tenant.

     mount() runs on a poll from first paint, and OMEGA_WORKSPACE does not
     exist until auth resolves. The first version treated a missing workspace
     as a blank vertical and a blank vertical as "show it" — so the block
     mounted on the very first tick, before anything knew who this was, and a
     developer tenant got a referral inbox. Caught on Chileasing.

     'unknown' keeps the caller polling instead of deciding. */
  function enabledHere(c) {
    if (c.enabled === true) return true;
    if (c.enabled === false) return false;
    var ws = global.OMEGA_WORKSPACE ||
             (global.CLEARSKY_CONFIG && global.CLEARSKY_CONFIG.tenant);
    if (!ws) return 'unknown';                       /* not resolved yet */
    var v = String(ws.vertical || '').toLowerCase();
    /* Resolved, but no vertical recorded. Show it — that is how this behaved
       before the gate existed, and nobody should lose an inbox they are
       already working out of because a field was never backfilled. */
    if (!v) return true;
    return RECEIVING_VERTICALS[v] === 1;
  }

  function ws() {
    return global.OMEGA_WORKSPACE
        || (global.CLEARSKY_CONFIG && global.CLEARSKY_CONFIG.tenant)
        || {};
  }

  function orgId() { return ws().orgId || ''; }

  /* ── Which org is the SIGNED-IN USER in? ────────────────────────────────
     NOT the same as orgId(). orgId() is the tenant this deployment serves and
     is pinned in config.js — on FENECON's portal it reads 'fenecon.com' for
     everyone who signs in, ClearSky staff previewing it included.

     For a referral that distinction is the entire point. toOrgId is the tenant
     the request is addressed to; fromOrgId is the SENDER'S OWN org. Stamping
     fromOrgId from config had a ClearSky admin filing referrals as
     fenecon.com, which the Firestore rule refuses outright — the rule requires
     fromOrgId == userOrg(), and userOrg() is derived from the signed-in email
     domain, not from this deployment's config.

     ⚠ ORG_ALIAS MIRRORS orgAlias() IN firestore.rules, DELIBERATELY.
     FENECON signs in from fenecon.com, fenecon.de and fenecon.us and all three
     fold to one org. If these two lists drift, the rule and the client
     disagree about who the sender is, and every referral filed from an aliased
     domain is refused with permission-denied and nothing says why. That is the
     same failure the capacity ledger already hit. Add a tenant to BOTH. */
  var ORG_ALIAS = {
    'fenecon.de': 'fenecon.com',
    'fenecon.us': 'fenecon.com'
  };
  function myOrg() {
    var d = (myEmail().split('@')[1] || '').toLowerCase();
    return ORG_ALIAS[d] || d;
  }
  function clientName() { return ws().clientName || 'this workspace'; }

  function me() {
    try { return (global.firebase && firebase.auth && firebase.auth().currentUser) || null; }
    catch (e) { return null; }
  }

  function myEmail() { var u = me(); return ((u && u.email) || '').toLowerCase(); }

  function myName() {
    var u = me();
    if (!u) return '';
    if (u.displayName) return u.displayName;
    var e = (u.email || '').split('@')[0];
    return e ? e.replace(/[._-]+/g, ' ').replace(/\b\w/g, function (m) { return m.toUpperCase(); }) : '';
  }

  function isAdmin() {
    var d = myEmail().split('@')[1] || '';
    var list = (global.CLEARSKY_CONFIG && global.CLEARSKY_CONFIG.adminDomains) || [];
    for (var i = 0; i < list.length; i++) { if (list[i] === d) return true; }
    return false;
  }

  function mayRefer() { return cfg().canRefer === 'admin' ? isAdmin() : true; }

  function db() {
    try {
      return (global.firebase && firebase.apps && firebase.apps.length)
        ? firebase.firestore() : null;
    } catch (e) { return null; }
  }

  function stamp() {
    return firebase.firestore.FieldValue.serverTimestamp();
  }

  /* ════════════════════════════════════════════════════════════════════════
     SMALL UTILITIES
     ════════════════════════════════════════════════════════════════════════ */

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function el(tag, attrs, html) {
    var n = document.createElement(tag);
    if (attrs) for (var k in attrs) { if (attrs.hasOwnProperty(k)) n.setAttribute(k, attrs[k]); }
    if (html != null) n.innerHTML = html;
    return n;
  }

  function $(id) { return document.getElementById(id); }

  function toDate(v) {
    if (!v) return null;
    if (v.toDate) { try { return v.toDate(); } catch (e) { return null; } }
    if (v instanceof Date) return v;
    if (typeof v === 'number') return new Date(v);
    return null;
  }

  /* "3 days ago" reads faster than a date when the question is "how long have
     we been sitting on this". Falls back to a date past a fortnight. */
  function ago(v) {
    var d = toDate(v); if (!d) return '—';
    var s = Math.floor((Date.now() - d.getTime()) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) { var m = Math.floor(s / 60); return m + (m === 1 ? ' min ago' : ' mins ago'); }
    if (s < 86400) { var h = Math.floor(s / 3600); return h + (h === 1 ? ' hour ago' : ' hours ago'); }
    var dd = Math.floor(s / 86400);
    if (dd <= 14) return dd + (dd === 1 ? ' day ago' : ' days ago');
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function dateStr(v) {
    var d = toDate(v); if (!d) return '—';
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function statusOf(k) {
    for (var i = 0; i < STATUS.length; i++) { if (STATUS[i].key === k) return STATUS[i]; }
    return STATUS[0];
  }

  function docKindLabel(k) {
    for (var i = 0; i < DOC_KIND.length; i++) { if (DOC_KIND[i].key === k) return DOC_KIND[i].label; }
    return 'Document';
  }

  function bytes(n) {
    if (!n && n !== 0) return '';
    if (n < 1024) return n + ' B';
    if (n < 1048576) return Math.round(n / 1024) + ' KB';
    return (n / 1048576).toFixed(1) + ' MB';
  }

  function num(v) {
    var n = parseFloat(v);
    return isFinite(n) ? n : null;
  }

  function money(v, cur) {
    var n = num(v); if (n === null) return '';
    var sym = CURRENCY[cur || 'USD'] || '';
    return sym + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  /* A quote counts as sent once it has a number on it. Fields typed into the
     form but never submitted are not a quote. */
  function quoteOf(r) {
    var q = r.quote;
    return (q && num(q.total) !== null) ? q : null;
  }

  /* ════════════════════════════════════════════════════════════════════════
     STYLES
     Everything is prefixed `or-` and scoped under #or-block / #or-drawer /
     #or-compose so nothing here can reach into the host page. Colours come
     from the host's own tokens where they exist, with literal fallbacks so
     the file also renders correctly if dropped onto a page that lacks them.
     ════════════════════════════════════════════════════════════════════════ */

  var STYLED = false;
  function injectStyles() {
    if (STYLED) return; STYLED = true;
    var s = document.createElement('style');
    s.id = 'or-styles';
    s.textContent = [
      /* ── shell ── */
      '#or-block .or-bar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px}',
      '#or-block .or-tabs{display:inline-flex;background:#EDEFF1;border-radius:9px;padding:3px;gap:2px}',
      '#or-block .or-tab{border:0;background:transparent;font:600 12.5px "DM Sans",sans-serif;',
        'color:var(--sap-ink-2,#556B82);padding:6px 14px;border-radius:7px;cursor:pointer}',
      '#or-block .or-tab.on{background:#fff;color:var(--sap-ink,#1D2D3E);box-shadow:0 1px 2px rgba(16,32,48,.10)}',
      '#or-block .or-tab:focus-visible{outline:2px solid var(--sap-blue,#0070F2);outline-offset:2px}',
      '#or-block .or-spacer{flex:1}',
      '#or-block .or-sel{font:600 12px "DM Sans",sans-serif;color:var(--sap-ink,#1D2D3E);',
        'border:1px solid var(--sap-card-border,#E4E8EC);background:#fff;border-radius:8px;padding:6px 10px;cursor:pointer}',
      '#or-block .or-lbl{font:500 12px "DM Sans",sans-serif;color:var(--sap-ink-2,#556B82)}',
      '#or-block .or-new{border:0;background:var(--cs-navy,#08384F);color:#fff;border-radius:9px;',
        'padding:8px 15px;font:600 12.5px "DM Sans",sans-serif;cursor:pointer}',
      '#or-block .or-new:hover{background:var(--cs-blue,#006F9A)}',

      /* ── notices ── */
      '#or-block .or-note{border-radius:10px;padding:11px 14px;font-size:12.5px;line-height:1.5;margin-bottom:12px}',
      '#or-block .or-note.warn{background:#FFF6E5;border:1px solid #F2D39B;color:#6B4E12}',
      '#or-block .or-note.err{background:#FDECEA;border:1px solid #F3B9B3;color:#8C231C}',
      '#or-block .or-note b{font-weight:700}',
      '#or-block .or-note a{color:inherit;font-weight:600;text-decoration:underline;cursor:pointer}',

      /* ── layout: matrix left, rail right ── */
      '#or-block .or-split{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(260px,.85fr);gap:16px;align-items:start}',
      '@media (max-width:940px){#or-block .or-split{grid-template-columns:1fr}}',
      '#or-block .or-card{background:var(--sap-card,#fff);border:1px solid var(--sap-card-border,#E4E8EC);',
        'border-radius:12px;padding:16px}',

      /* ── the matrix ── */
      '#or-block .or-mx-wrap{display:grid;grid-template-columns:22px minmax(0,1fr);gap:8px;max-width:500px;margin:0 auto}',
      '#or-block .or-yaxis{writing-mode:vertical-rl;transform:rotate(180deg);font:500 10px "DM Mono",monospace;',
        'letter-spacing:.06em;color:var(--sap-ink-2,#556B82);text-align:center;align-self:center;text-transform:uppercase}',
      '#or-block .or-mx{display:grid;grid-template-columns:repeat(10,1fr);gap:5px;max-width:470px}',
      '#or-block .or-cell{aspect-ratio:1;border-radius:6px;background:#EEF1F4;border:1px solid transparent;',
        'display:flex;align-items:center;justify-content:center;font:700 12px "DM Sans",sans-serif;',
        'color:transparent;cursor:default;padding:0;transition:transform .1s ease}',
      '#or-block .or-cell.mkt{border-color:#E06C4F}',
      '#or-block .or-cell.has{background:#E9581F;color:#fff;cursor:pointer}',
      '#or-block .or-cell.has:hover{transform:scale(1.08)}',
      '#or-block .or-cell.sel{outline:2px solid var(--sap-ink,#1D2D3E);outline-offset:1px}',
      '#or-block .or-cell:focus-visible{outline:2px solid var(--sap-blue,#0070F2);outline-offset:2px}',
      '#or-block .or-xaxis{grid-column:2;font:500 10px "DM Mono",monospace;letter-spacing:.06em;',
        'color:var(--sap-ink-2,#556B82);text-align:center;margin-top:8px;text-transform:uppercase;max-width:470px}',

      /* ── rail stats ── */
      '#or-block .or-stat{background:var(--sap-card,#fff);border:1px solid var(--sap-card-border,#E4E8EC);',
        'border-radius:12px;padding:14px 16px;margin-bottom:10px}',
      '#or-block .or-stat .k{font:500 10.5px "DM Mono",monospace;letter-spacing:.08em;',
        'color:var(--sap-ink-2,#556B82);text-transform:uppercase}',
      '#or-block .or-stat .v{font:700 28px "DM Sans",sans-serif;color:var(--sap-num,#223548);',
        'line-height:1.1;margin:6px 0 3px}',
      '#or-block .or-stat .s{font-size:12px;color:var(--sap-ink-2,#556B82)}',

      /* ── tables ── */
      '#or-block table{width:100%;border-collapse:collapse}',
      '#or-block th{font:600 10.5px "DM Mono",monospace;letter-spacing:.08em;text-transform:uppercase;',
        'color:var(--sap-ink-2,#556B82);text-align:left;padding:0 10px 9px;border-bottom:1px solid var(--sap-card-border,#E4E8EC)}',
      '#or-block td{padding:11px 10px;font-size:13px;color:var(--sap-ink,#1D2D3E);',
        'border-bottom:1px solid #F0F2F4;vertical-align:middle}',
      '#or-block tr.or-row{cursor:pointer}',
      '#or-block tr.or-row:hover td{background:#F7F9FB}',
      '#or-block tr.or-row:focus-visible{outline:2px solid var(--sap-blue,#0070F2);outline-offset:-2px}',
      '#or-block td .site{font-weight:600}',
      '#or-block td .sub{font-size:11.5px;color:var(--sap-ink-2,#556B82);margin-top:2px}',
      '#or-block td.mut{color:var(--sap-ink-2,#556B82)}',
      /* Six columns will not fit a phone. Below 720px the sender, the size and
         the document count fold into the site cell rather than being dropped,
         so nothing is lost — it just stacks. */
      '#or-block .or-fold{display:none}',
      '@media (max-width:720px){',
      '#or-block .or-hide-sm{display:none}',
      '#or-block .or-fold{display:block}',
      '#or-block th,#or-block td{padding-left:8px;padding-right:8px}',
      '#or-block td:first-child,#or-block th:first-child{width:100%}',
      '}',

      /* ── pills ── */
      '.or-pill{display:inline-block;padding:3px 9px;border-radius:20px;font:600 11px "DM Sans",sans-serif;white-space:nowrap}',
      '.or-pill.blue{background:#E4EFFB;color:#0A4E8F}',
      '.or-pill.amber{background:#FDF0D9;color:#7A5410}',
      '.or-pill.teal{background:#DCF3F1;color:#0A5B55}',
      '.or-pill.green{background:#DFF3E4;color:#14622A}',
      '.or-pill.grey{background:#ECEFF2;color:#556B82}',
      '.or-dot{display:inline-block;width:6px;height:6px;border-radius:50%;background:#E9581F;margin-right:6px;vertical-align:middle}',
      '.or-chip{display:inline-block;padding:2px 8px;border-radius:6px;background:#F0F2F5;',
        'font:500 11px "DM Mono",monospace;color:var(--sap-ink-2,#556B82);margin-right:4px}',
      '.or-chip.on{background:#E4EFFB;color:#0A4E8F}',

      /* ── empty ── */
      '#or-block .or-empty{text-align:center;padding:34px 20px;color:var(--sap-ink-2,#556B82);font-size:13px;line-height:1.6}',
      '#or-block .or-empty b{display:block;color:var(--sap-ink,#1D2D3E);font-size:14.5px;margin-bottom:5px}',
      '#or-block .or-seedbar{margin-top:26px;padding-top:20px;border-top:1px solid var(--sap-card-border,#E4E8EC)}',
      '#or-block .or-seedhint{font-size:11.5px;color:#8895A3;line-height:1.5;margin-top:9px;max-width:430px;',
        'margin-left:auto;margin-right:auto}',
      '#or-block .or-seedhint code{font:500 11px "DM Mono",monospace;background:#F0F2F5;padding:1px 5px;border-radius:4px}',
      '#or-block .or-seedhint.bad{color:#B3261E}',
      '#or-block .or-seedbar .or-btn[disabled]{opacity:.5;cursor:wait}',

      /* ── drawer ── */
      '#or-scrim{position:fixed;inset:0;background:rgba(12,26,38,.42);z-index:9200;opacity:0;',
        'pointer-events:none;transition:opacity .18s ease}',
      '#or-scrim.on{opacity:1;pointer-events:auto}',
      '#or-drawer{position:fixed;top:0;right:0;height:100%;width:min(560px,100vw);background:#fff;',
        'z-index:9201;box-shadow:-14px 0 44px rgba(12,26,38,.20);transform:translateX(100%);',
        'transition:transform .22s cubic-bezier(.32,.72,0,1);display:flex;flex-direction:column;',
        'font-family:"DM Sans",sans-serif}',
      '#or-drawer.on{transform:translateX(0)}',
      '@media (prefers-reduced-motion:reduce){#or-drawer,#or-scrim{transition:none}}',
      '#or-drawer .dh{padding:20px 22px 15px;border-bottom:1px solid #E9EDF1;flex:0 0 auto}',
      '#or-drawer .dh h3{font-size:18px;font-weight:700;color:#1D2D3E;margin:0 0 4px;line-height:1.3;padding-right:42px}',
      '#or-drawer .dh .addr{font-size:12.5px;color:#556B82}',
      '#or-drawer .dx{position:absolute;top:16px;right:18px;border:0;background:#F0F2F5;width:30px;height:30px;',
        'border-radius:8px;font-size:17px;line-height:1;color:#556B82;cursor:pointer}',
      '#or-drawer .dx:hover{background:#E4E8EC}',
      '#or-drawer .db{flex:1;overflow-y:auto;padding:18px 22px 26px}',
      '#or-drawer .sec{margin-bottom:22px}',
      '#or-drawer .sec>h4{font:600 10.5px "DM Mono",monospace;letter-spacing:.08em;text-transform:uppercase;',
        'color:#556B82;margin:0 0 10px}',
      '#or-drawer .kv{display:grid;grid-template-columns:150px minmax(0,1fr);gap:7px 12px;font-size:13px}',
      '#or-drawer .kv dt{color:#556B82}',
      '#or-drawer .kv dd{margin:0;color:#1D2D3E;font-weight:500;word-break:break-word}',
      '#or-drawer .ask{background:#F7F9FB;border:1px solid #E9EDF1;border-radius:10px;padding:13px 15px;',
        'font-size:13.5px;line-height:1.6;color:#1D2D3E;white-space:pre-wrap}',
      '#or-drawer .doc{display:flex;align-items:center;gap:11px;padding:10px 12px;border:1px solid #E9EDF1;',
        'border-radius:9px;margin-bottom:7px;text-decoration:none;color:inherit}',
      '#or-drawer a.doc:hover{border-color:#0070F2;background:#F7FAFE}',
      '#or-drawer .doc .ic{flex:0 0 auto;width:30px;height:30px;border-radius:7px;background:#EDF1F5;',
        'display:flex;align-items:center;justify-content:center;font:600 9px "DM Mono",monospace;color:#556B82}',
      '#or-drawer .doc .nm{flex:1;min-width:0;font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '#or-drawer .doc .mt{display:block;font-size:11.5px;color:#556B82;font-weight:400;margin-top:2px;'
        + 'white-space:normal}',
      '#or-drawer .doc .rm{border:0;background:transparent;color:#8895A3;cursor:pointer;font-size:15px;padding:2px 5px}',
      '#or-drawer .doc .rm:hover{color:#B3261E}',
      '#or-drawer .act{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}',
      '#or-drawer button.sbtn{border:1px solid #D9DFE5;background:#fff;border-radius:8px;padding:7px 13px;',
        'font:600 12px "DM Sans",sans-serif;color:#1D2D3E;cursor:pointer}',
      '#or-drawer button.sbtn:hover{border-color:#0070F2;color:#0070F2}',
      '#or-drawer button.sbtn.on{background:#1D2D3E;border-color:#1D2D3E;color:#fff}',
      '#or-drawer .qbox{border:1px solid #CDE3DC;background:#F4FAF8;border-radius:11px;padding:14px 16px}',
      '#or-drawer .qtop{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}',
      '#or-drawer .qnum{font:700 24px "DM Sans",sans-serif;color:#0A5B55;letter-spacing:-.5px}',
      '#or-drawer .qwhen{font-size:11.5px;color:#5D7A74}',
      '#or-drawer .qnotes{margin-top:11px;padding-top:11px;border-top:1px solid #D9E9E4;',
        'font-size:12.5px;line-height:1.55;color:#2F4A45;white-space:pre-wrap}',
      '#or-drawer .qhist{margin-top:9px;font-size:11.5px;color:#5D7A74}',
      '#or-drawer .qnone{font-size:12.5px;color:#8895A3;line-height:1.55}',
      '#or-drawer .qrevise{font-size:11.5px;color:#8895A3;margin-bottom:11px;line-height:1.45}',
      '#or-drawer .feed{border-left:2px solid #E9EDF1;padding-left:14px;margin-left:3px}',
      '#or-drawer .feed .ev{margin-bottom:13px;font-size:12.5px;line-height:1.5;color:#3E4C59}',
      '#or-drawer .feed .ev b{color:#1D2D3E}',
      '#or-drawer .feed .ev .t{display:block;font-size:11px;color:#8895A3;margin-top:2px}',
      '#or-drawer .df{flex:0 0 auto;border-top:1px solid #E9EDF1;padding:13px 22px;display:flex;gap:9px;align-items:center}',
      '#or-drawer .df .grow{flex:1}',

      /* ── forms (drawer + compose share these) ── */
      '.or-f{margin-bottom:13px}',
      '.or-f label{display:block;font:600 11px "DM Sans",sans-serif;color:#556B82;margin-bottom:5px}',
      '.or-f input,.or-f select,.or-f textarea{width:100%;box-sizing:border-box;padding:9px 11px;',
        'border:1px solid #D9DFE5;border-radius:8px;font:400 13px "DM Sans",sans-serif;color:#1D2D3E;',
        'background:#fff;outline:none}',
      '.or-f input:focus,.or-f select:focus,.or-f textarea:focus{border-color:#0070F2;box-shadow:0 0 0 3px rgba(0,112,242,.12)}',
      '.or-f textarea{resize:vertical;min-height:78px;line-height:1.55}',
      '.or-f .hint{font-size:11.5px;color:#8895A3;margin-top:4px;line-height:1.45}',
      '.or-2{display:grid;grid-template-columns:1fr 1fr;gap:11px}',
      '@media (max-width:520px){.or-2{grid-template-columns:1fr}}',
      '.or-drop{border:1.5px dashed #C8D2DB;border-radius:10px;padding:16px;text-align:center;',
        'font-size:12.5px;color:#556B82;cursor:pointer;background:#FBFCFD}',
      '.or-drop:hover,.or-drop.over{border-color:#0070F2;background:#F5FAFF;color:#0A4E8F}',
      '.or-msg{font-size:12.5px;margin-top:9px;line-height:1.5}',
      '.or-msg.bad{color:#B3261E}',
      '.or-msg.good{color:#14622A}',

      /* ── compose modal ── */
      '#or-compose{position:fixed;inset:0;z-index:9300;display:none;align-items:flex-start;',
        'justify-content:center;background:rgba(12,26,38,.46);padding:40px 18px;overflow-y:auto;',
        'font-family:"DM Sans",sans-serif}',
      '#or-compose.on{display:flex}',
      '#or-compose .cc{background:#fff;border-radius:14px;width:min(620px,100%);',
        'box-shadow:0 22px 60px rgba(12,26,38,.30);overflow:hidden}',
      '#or-compose .ch{padding:20px 24px 15px;border-bottom:1px solid #E9EDF1}',
      '#or-compose .ch h3{margin:0 0 4px;font-size:18px;font-weight:700;color:#1D2D3E}',
      '#or-compose .ch p{margin:0;font-size:12.5px;color:#556B82;line-height:1.5}',
      '#or-compose .cb{padding:20px 24px;max-height:min(62vh,600px);overflow-y:auto}',
      '#or-compose .cf{padding:14px 24px;border-top:1px solid #E9EDF1;display:flex;gap:9px;align-items:center}',
      '#or-compose .cf .grow{flex:1}',
      '.or-btn{border:0;border-radius:9px;padding:10px 19px;font:600 13px "DM Sans",sans-serif;cursor:pointer}',
      '.or-btn.pri{background:var(--cs-navy,#08384F);color:#fff}',
      '.or-btn.pri:hover{background:var(--cs-blue,#006F9A)}',
      '.or-btn.pri[disabled]{opacity:.45;cursor:not-allowed}',
      '.or-btn.sec{background:#fff;color:#556B82;border:1px solid #D9DFE5}',
      '.or-btn.sec:hover{color:#1D2D3E}'
    ].join('');
    document.head.appendChild(s);
  }

  /* ════════════════════════════════════════════════════════════════════════
     STATE
     One live snapshot of everything addressed to this tenant. Rendering is a
     pure function of S — nothing mutates the DOM outside render().
     ════════════════════════════════════════════════════════════════════════ */

  var S = {
    rows:    [],          // referrals, newest first
    ready:   false,
    err:     null,        // string shown in place of content
    view:    'inbox',     // 'inbox' | 'matrix'
    market:  null,        // overrides cfg().market once the user picks
    show:    'open',      // 'open' | 'all'
    cell:    null,        // {gx,by} matrix cell filter
    openId:  null,        // referral open in the drawer
    uploading: false
  };

  var _unsub = null;

  /* ════════════════════════════════════════════════════════════════════════
     DATA
     ════════════════════════════════════════════════════════════════════════ */

  function listen() {
    var d = db(), org = orgId();
    if (!d || !org) return;
    if (_unsub) { try { _unsub(); } catch (e) {} _unsub = null; }

    /* Deliberately NOT ordered in the query. orderBy('createdAt') would need a
       composite index on (toOrgId, createdAt) and a missing index fails the
       whole listener with a console link nobody reads. Sorting a few hundred
       referrals client-side costs nothing. */
    _unsub = d.collection('referrals').where('toOrgId', '==', org)
      .onSnapshot(function (snap) {
        var out = [];
        snap.forEach(function (doc) {
          var r = doc.data() || {}; r.id = doc.id; out.push(r);
        });
        out.sort(function (a, b) {
          var x = toDate(a.createdAt), y = toDate(b.createdAt);
          return (y ? y.getTime() : 0) - (x ? x.getTime() : 0);
        });
        S.rows = out; S.ready = true; S.err = null;
        render();
      }, function (e) {
        S.ready = true;
        S.err = (e && e.code === 'permission-denied')
          ? 'Referrals are not readable yet. The Firestore rule for the '
            + '<b>referrals</b> collection has not been deployed — see the note at the '
            + 'foot of omega-referrals.js, then run <b>firebase deploy --only firestore:rules</b>.'
          : 'Referrals could not load: ' + esc((e && e.message) || 'unknown error');
        render();
      });
  }

  function patch(id, fields, event) {
    var d = db(); if (!d) return Promise.reject(new Error('No Firestore.'));
    fields.updatedAt = stamp();
    if (event) {
      fields.activity = firebase.firestore.FieldValue.arrayUnion({
        at: Date.now(),                       // arrayUnion forbids serverTimestamp
        by: myName() || myEmail(),
        byEmail: myEmail(),
        text: event
      });
    }
    return d.collection('referrals').doc(id).update(fields);
  }

  function byId(id) {
    for (var i = 0; i < S.rows.length; i++) { if (S.rows[i].id === id) return S.rows[i]; }
    return null;
  }

  /* ════════════════════════════════════════════════════════════════════════
     MATRIX MATH
     Scores are 0–99. A decile band is score/10 floored, so 0–9 → 0 and
     90–99 → 9. Grid runs left to right, bankability runs bottom to top,
     which puts the corner worth chasing at top right.
     ════════════════════════════════════════════════════════════════════════ */

  function band(v) {
    var n = num(v);
    if (n === null) return null;
    n = Math.max(0, Math.min(99, n));
    return Math.floor(n / 10);
  }

  function gridBand(r)     { return band(r.gridScore); }
  function bankableBand(r) { return band(r.bankableScore); }
  function placed(r)       { return gridBand(r) !== null && bankableBand(r) !== null; }

  function marketKey() { return S.market || cfg().market; }
  function marketFloor() { return MARKET_FLOOR[marketKey()] != null ? MARKET_FLOOR[marketKey()] : 50; }
  function marketBand() { return Math.floor(marketFloor() / 10); }

  function inMarket(r) {
    if (!placed(r)) return false;
    var f = marketBand();
    return gridBand(r) >= f && bankableBand(r) >= f;
  }

  function bandLabel(b) { return (b * 10) + '\u2013' + (b * 10 + 9); }

  /* Which scores a referral is missing, named after the products that supply
     them so the tenant knows who to chase rather than just that a number is
     absent. */
  function missing(r) {
    var names = cfg().scoreNames || {}, out = [];
    if (gridBand(r) === null)     out.push(names.grid     || 'Grid score');
    if (bankableBand(r) === null) out.push(names.bankable || 'Bankability score');
    return out;
  }

  function axisLabel(which) {
    var n = cfg().scoreNames || {};
    if (which === 'grid') return (n.grid ? n.grid + ' \u00B7 ' : '') + 'can it be built';
    return (n.bankable ? n.bankable + ' \u00B7 ' : '') + 'would it fund';
  }

  /* ── Filters ─────────────────────────────────────────────────────────── */

  function visible() {
    var out = S.rows.filter(function (r) {
      if (S.show === 'open' && !statusOf(r.status).open) return false;
      if (S.cell) {
        if (gridBand(r) !== S.cell.gx || bankableBand(r) !== S.cell.by) return false;
      }
      return true;
    });
    return out;
  }

  /* ── Duplicate detection ─────────────────────────────────────────────────
     Two referrals for one site is the failure that hides: the work gets split
     across two records, each looks half as interesting as the site really is,
     and nobody notices. Match on normalised address first, name second. */
  /* Two people typing the same address rarely type it the same way. "330
     Roberts St, Clinton IA" and "330 Roberts Street, Clinton, IA" are one
     site, and a naive strip-the-punctuation comparison misses it — which is
     exactly the case this check exists to catch. Fold the common suffixes to
     one form before comparing. */
  var STREET = {
    street: 'st', str: 'st', drive: 'dr', road: 'rd', avenue: 'ave', av: 'ave',
    boulevard: 'blvd', lane: 'ln', court: 'ct', circle: 'cir', place: 'pl',
    parkway: 'pkwy', highway: 'hwy', terrace: 'ter', square: 'sq',
    north: 'n', south: 's', east: 'e', west: 'w',
    northeast: 'ne', northwest: 'nw', southeast: 'se', southwest: 'sw',
    suite: 'ste', apartment: 'apt', building: 'bldg'
  };
  var CORP = /\b(llc|l\.l\.c|inc|incorporated|ltd|limited|gmbh|corp|corporation|co|company|lp|llp|plc|kg|ag|bv|sarl)\b/g;

  function fold(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/[.,#()'"\u2013\u2014\-\/]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      .map(function (w) { return STREET[w] || w; })
      .join(' ');
  }

  function normKey(r) {
    var a = fold(r.address).replace(/[^a-z0-9]+/g, '');
    if (a.length > 8) return 'a:' + a;
    var n = fold(r.siteName).replace(CORP, ' ').replace(/[^a-z0-9]+/g, '');
    return n ? 'n:' + n : '';
  }

  function duplicates() {
    var seen = {}, dupes = [];
    S.rows.forEach(function (r) {
      if (!statusOf(r.status).open) return;
      var k = normKey(r); if (!k) return;
      if (seen[k]) { if (dupes.indexOf(seen[k]) < 0) dupes.push(seen[k]); dupes.push(r); }
      else seen[k] = r;
    });
    /* Collapse to one entry per colliding site. */
    var groups = {}, list = [];
    dupes.forEach(function (r) { var k = normKey(r); (groups[k] = groups[k] || []).push(r); });
    for (var k in groups) { if (groups.hasOwnProperty(k)) list.push(groups[k]); }
    return list;
  }

  /* ════════════════════════════════════════════════════════════════════════
     RENDER — BLOCK SHELL
     ════════════════════════════════════════════════════════════════════════ */

  function render() {
    var body = $('or-body'); if (!body) return;
    paintHead();

    if (!S.ready) { body.innerHTML = '<div class="or-empty">Loading referrals\u2026</div>'; return; }
    if (S.err)    { body.innerHTML = '<div class="or-note err">' + S.err + '</div>'; return; }

    var html = noticesHtml();
    html += (S.view === 'matrix') ? matrixHtml() : inboxHtml();
    body.innerHTML = html;
    wireBody();

    /* A snapshot that changes the open referral must reach the drawer too —
       otherwise saving a status from the drawer leaves the drawer showing the
       old one. Skipped mid-upload, which would wipe the progress line. */
    if (S.openId && !S.uploading && byId(S.openId) && $('or-drawer')) repaintDrawer();
  }

  /* Repaint without losing what the user was part-way through typing. */
  function repaintDrawer() {
    var link = $('or-dlink'), kind = $('or-dkind');
    var keepLink = link ? link.value : '';
    var keepKind = kind ? kind.value : '';
    paintDrawer();
    if (keepLink) { var l = $('or-dlink'); if (l) l.value = keepLink; }
    if (keepKind) { var k = $('or-dkind'); if (k) k.value = keepKind; }
  }

  /* Head is the count badge + toolbar. Rebuilt separately so switching views
     doesn't reset the toolbar's focus. */
  function paintHead() {
    var open = S.rows.filter(function (r) { return statusOf(r.status).open; }).length;
    var fresh = S.rows.filter(function (r) { return r.status === 'new'; }).length;

    var cnt = $('or-count');
    if (cnt) { cnt.textContent = open; cnt.style.display = open ? '' : 'none'; }

    var sub = $('or-sub');
    if (sub) {
      sub.innerHTML = fresh
        ? '<span class="or-dot"></span>' + fresh + (fresh === 1 ? ' new request' : ' new requests')
          + ' waiting on ' + esc(clientName())
        : 'Quote requests sent to ' + esc(clientName()) + ' by developers and partners on the platform';
    }

    var bar = $('or-bar'); if (!bar) return;
    var mk = marketKey();
    bar.innerHTML =
      '<div class="or-tabs" role="tablist">'
      + '<button class="or-tab' + (S.view === 'inbox' ? ' on' : '') + '" role="tab" data-view="inbox"'
      + ' aria-selected="' + (S.view === 'inbox') + '">Requests</button>'
      + '<button class="or-tab' + (S.view === 'matrix' ? ' on' : '') + '" role="tab" data-view="matrix"'
      + ' aria-selected="' + (S.view === 'matrix') + '">Matrix</button>'
      + '</div>'
      + '<select class="or-sel" id="or-show" aria-label="Which requests to show">'
      + '<option value="open"' + (S.show === 'open' ? ' selected' : '') + '>Still open</option>'
      + '<option value="all"' + (S.show === 'all' ? ' selected' : '') + '>Everything</option>'
      + '</select>'
      + (S.view === 'matrix'
          ? '<span class="or-lbl">Buyer\u2019s market</span>'
            + '<select class="or-sel" id="or-mkt" aria-label="How tight the buyer\u2019s market is">'
            + ['tightest', 'tight', 'open'].map(function (k) {
                return '<option value="' + k + '"' + (mk === k ? ' selected' : '') + '>' + k + '</option>';
              }).join('')
            + '</select>'
          : '')
      + '<span class="or-spacer"></span>'
      + (mayRefer() ? '<button class="or-new" id="or-new">Send a referral</button>' : '');
  }

  function noticesHtml() {
    var out = '';

    var dupes = duplicates();
    if (dupes.length) {
      out += '<div class="or-note warn"><b>' + dupes.length + ' possible duplicate'
        + (dupes.length === 1 ? '' : 's') + '.</b> Two requests for one site halve that site\u2019s '
        + 'numbers without anybody noticing. '
        + dupes.map(function (g) {
            return '<a data-open="' + esc(g[0].id) + '">' + esc(g[0].siteName || g[0].address || 'Untitled')
              + ' (' + g.length + ')</a>';
          }).join(' \u00B7 ')
        + '</div>';
    }

    if (S.cell) {
      out += '<div class="or-note warn">Showing one square: '
        + esc(axisLabel('grid')) + ' ' + bandLabel(S.cell.gx) + ' \u00B7 '
        + esc(axisLabel('bankable')) + ' ' + bandLabel(S.cell.by)
        + ' \u00B7 <a data-clear="1">show all</a></div>';
    }
    return out;
  }

  /* ════════════════════════════════════════════════════════════════════════
     RENDER — REQUESTS (inbox)
     ════════════════════════════════════════════════════════════════════════ */

  function inboxHtml() {
    var rows = visible();
    if (!rows.length) return emptyHtml();

    return '<div class="or-card" style="padding:6px 6px 2px">'
      + '<table><thead><tr>'
      + '<th style="padding-left:14px">Site</th>'
      + '<th class="or-hide-sm">From</th>'
      + '<th class="or-hide-sm">Asking for</th>'
      + '<th class="or-hide-sm">Quote</th>'
      + '<th>Status</th>'
      + '<th class="or-hide-sm" style="text-align:right;padding-right:14px">Received</th>'
      + '</tr></thead><tbody>'
      + rows.map(rowHtml).join('')
      + '</tbody></table></div>';
  }

  function rowHtml(r) {
    var st = statusOf(r.status);
    var docs = (r.docs || []).length;
    var q = quoteOf(r);
    var sq = placed(r)
      ? '<span class="or-chip' + (inMarket(r) ? ' on' : '') + '" title="'
        + esc(axisLabel('grid')) + ' ' + num(r.gridScore) + ' \u00B7 '
        + esc(axisLabel('bankable')) + ' ' + num(r.bankableScore) + '">'
        + num(r.gridScore) + '/' + num(r.bankableScore) + '</span>'
      : '<span class="or-chip" title="Cannot be placed on the matrix yet">not scored</span>';

    return '<tr class="or-row" tabindex="0" data-open="' + esc(r.id) + '">'
      + '<td style="padding-left:14px">'
        + '<div class="site">' + (r.status === 'new' ? '<span class="or-dot"></span>' : '')
        + esc(r.siteName || 'Untitled site') + '</div>'
        + '<div class="sub">' + esc(r.address || 'No address given') + ' \u00B7 ' + sq + '</div>'
      + '<div class="sub or-fold">' + esc(r.fromName || r.fromEmail || '\u2014')
        + (sizeLine(r) ? ' \u00B7 ' + esc(sizeLine(r)) : '')
        + (docs ? ' \u00B7 ' + docs + (docs === 1 ? ' file' : ' files') : '')
        + (q ? ' \u00B7 quoted ' + esc(money(q.total, q.currency)) : '')
        + ' \u00B7 ' + ago(r.createdAt) + '</div>'
      + '</td>'
      + '<td class="mut or-hide-sm">' + esc(r.fromName || r.fromEmail || '\u2014')
        + (r.fromOrgId ? '<div class="sub">' + esc(r.fromOrgId) + '</div>' : '') + '</td>'
      + '<td class="mut or-hide-sm">' + esc(sizeLine(r) || r.product || '\u2014') + '</td>'
      + '<td class="or-hide-sm">' + (q
          ? '<b>' + esc(money(q.total, q.currency)) + '</b>'
            + (q.leadTimeWeeks ? '<div class="sub">' + esc(q.leadTimeWeeks) + ' wk lead</div>' : '')
          : '<span class="mut">\u2014</span>') + '</td>'
      + '<td><span class="or-pill ' + st.tone + '">' + st.label + '</span></td>'
      + '<td class="mut or-hide-sm" style="text-align:right;padding-right:14px;white-space:nowrap">'
        + ago(r.createdAt) + '</td>'
      + '</tr>';
  }

  function sizeLine(r) {
    var p = [];
    if (num(r.powerKw))  p.push(fmtKw(num(r.powerKw)));
    if (num(r.energyKwh)) p.push(fmtKwh(num(r.energyKwh)));
    return p.join(' / ');
  }
  function fmtKw(v)  { return v >= 1000 ? (v / 1000).toFixed(v % 1000 ? 1 : 0) + ' MW'  : v + ' kW'; }
  function fmtKwh(v) { return v >= 1000 ? (v / 1000).toFixed(v % 1000 ? 1 : 0) + ' MWh' : v + ' kWh'; }

  function emptyHtml() {
    if (S.cell) {
      return '<div class="or-empty"><b>Nothing in that square</b>'
        + 'No request has scored ' + esc(axisLabel('grid')) + ' ' + bandLabel(S.cell.gx)
        + ' and ' + esc(axisLabel('bankable')) + ' ' + bandLabel(S.cell.by) + '.'
        + '<br><a href="#" data-clear="1" style="color:var(--sap-blue,#0070F2);font-weight:600">Show every request</a></div>';
    }
    if (S.show === 'open' && S.rows.length) {
      return '<div class="or-empty"><b>Nothing open</b>'
        + 'Every request has been answered. Switch to <b>Everything</b> to see the '
        + S.rows.length + ' closed ' + (S.rows.length === 1 ? 'one' : 'ones') + '.</div>';
    }
    return '<div class="or-empty"><b>No referrals yet</b>'
      + 'When someone on the platform wants a quote from ' + esc(clientName())
      + ', it arrives here with the site, the ask, and whatever they attached \u2014 '
      + 'site map, scope of work, bill of materials.'
      + (mayRefer() ? '<br><br><button class="or-btn pri" id="or-new2">Send a referral</button>' : '')
      + (cfg().demoSeed
          ? '<div class="or-seedbar">'
            + '<button class="or-btn sec" id="or-seed">Load demo data</button>'
            + '<div class="or-seedhint">Writes five sites and six quote requests to this '
            + 'workspace, owned by whoever is signed in. For demos \u2014 turn '
            + '<code>demoSeed</code> off in config.js before this account is real.</div>'
            + '</div>'
          : '')
      + '</div>';
  }

  /* ════════════════════════════════════════════════════════════════════════
     RENDER — MATRIX
     Every scored request is a square. Position is what it means: right is a
     better grid connection, up is better numbers, and the corner where both
     are high is where the quotes worth chasing are.
     ════════════════════════════════════════════════════════════════════════ */

  function matrixHtml() {
    var rows = S.rows.filter(function (r) { return S.show === 'all' || statusOf(r.status).open; });
    var grid = {}, waiting = [], mk = 0;

    rows.forEach(function (r) {
      if (!placed(r)) { waiting.push(r); return; }
      var k = gridBand(r) + ':' + bankableBand(r);
      (grid[k] = grid[k] || []).push(r);
      if (inMarket(r)) mk++;
    });

    var floor = marketBand(), cells = '';
    /* Top row is the highest bankability band, so iterate y downward. */
    for (var y = 9; y >= 0; y--) {
      for (var x = 0; x <= 9; x++) {
        var list = grid[x + ':' + y] || [];
        var cls = 'or-cell'
          + (x >= floor && y >= floor ? ' mkt' : '')
          + (list.length ? ' has' : '')
          + (S.cell && S.cell.gx === x && S.cell.by === y ? ' sel' : '');
        var tip = axisLabel('grid') + ' ' + bandLabel(x) + ' \u00B7 '
                + axisLabel('bankable') + ' ' + bandLabel(y) + ' \u00B7 '
                + (list.length ? list.length + (list.length === 1 ? ' request' : ' requests') : 'empty');
        cells += '<button class="' + cls + '" title="' + esc(tip) + '" aria-label="' + esc(tip) + '"'
          + (list.length ? ' data-cell="' + x + ':' + y + '"' : ' tabindex="-1" disabled')
          + '>' + (list.length || '') + '</button>';
      }
    }

    var placedCount = rows.length - waiting.length;

    return '<div class="or-split">'
      + '<div class="or-card">'
        + '<div class="or-mx-wrap">'
          + '<div class="or-yaxis">' + esc(axisLabel('bankable')) + ' \u2191</div>'
          + '<div class="or-mx">' + cells + '</div>'
          + '<div class="or-xaxis">' + esc(axisLabel('grid')) + ' \u2192</div>'
        + '</div>'
      + '</div>'
      + '<div>'
        + stat('In the buyer\u2019s market', mk, 'strong on both axes')
        + stat('Placed on the grid', placedCount, 'have both scores')
        + stat('Not yet scored', waiting.length, waiting.length
            ? 'need ' + esc(scoreNamesLine()) : 'nothing outstanding')
        + quotedStat(rows)
      + '</div>'
      + '</div>'
      + (waiting.length ? waitingHtml(waiting) : '');
  }

  function scoreNamesLine() {
    var n = cfg().scoreNames || {};
    var a = n.grid || 'a grid score', b = n.bankable || 'a bankability score';
    return a + ' or ' + b;
  }

  /* Value sitting with the customer. Only quotes still live count — a lost
     deal in the total is a number that flatters and decides nothing. Mixed
     currencies are shown separately rather than added together, because a
     single figure blending EUR and USD is worse than two honest ones. */
  function quotedStat(rows) {
    var by = {}, n = 0;
    rows.forEach(function (r) {
      var q = quoteOf(r); if (!q || !statusOf(r.status).open) return;
      var c = q.currency || 'USD';
      by[c] = (by[c] || 0) + num(q.total); n++;
    });
    if (!n) return stat('Out for quote', 0, 'nothing priced yet');
    var line = Object.keys(by).map(function (c) { return money(by[c], c); }).join(' + ');
    return stat('Out for quote', line,
      n + (n === 1 ? ' quote' : ' quotes') + ' with the customer');
  }

  function stat(k, v, s) {
    return '<div class="or-stat"><div class="k">' + esc(k) + '</div>'
      + '<div class="v">' + esc(String(v)) + '</div><div class="s">' + s + '</div></div>';
  }

  function waitingHtml(list) {
    return '<div class="or-card" style="margin-top:16px;padding:16px 6px 2px">'
      + '<div style="padding:0 10px 12px;display:flex;gap:10px;align-items:baseline;flex-wrap:wrap">'
        + '<span style="font-size:15px;font-weight:700;color:var(--sap-ink,#1D2D3E)">Waiting for a score</span>'
        + '<span style="font-size:12.5px;color:var(--sap-ink-2,#556B82)">They cannot be placed until they have both</span>'
      + '</div>'
      + '<table><thead><tr>'
        + '<th style="padding-left:14px">Site</th><th>Missing</th>'
        + '<th style="text-align:right;padding-right:14px">Status</th>'
      + '</tr></thead><tbody>'
      + list.map(function (r) {
          var st = statusOf(r.status);
          return '<tr class="or-row" tabindex="0" data-open="' + esc(r.id) + '">'
            + '<td style="padding-left:14px"><div class="site">' + esc(r.siteName || 'Untitled site') + '</div>'
              + '<div class="sub">' + esc(r.address || 'No address given') + '</div></td>'
            + '<td class="mut">' + esc(missing(r).join(' and ')) + '</td>'
            + '<td style="text-align:right;padding-right:14px"><span class="or-pill ' + st.tone + '">'
              + st.label + '</span></td>'
            + '</tr>';
        }).join('')
      + '</tbody></table></div>';
  }

  /* ════════════════════════════════════════════════════════════════════════
     EVENT WIRING
     Delegated where possible so re-rendering never leaves stale handlers.
     ════════════════════════════════════════════════════════════════════════ */

  function wireBody() {
    var body = $('or-body'); if (!body) return;

    body.addEventListener('click', function (e) {
      var t = e.target;

      var clear = t.closest ? t.closest('[data-clear]') : null;
      if (clear) { e.preventDefault(); S.cell = null; render(); return; }

      var cell = t.closest ? t.closest('[data-cell]') : null;
      if (cell) {
        var p = cell.getAttribute('data-cell').split(':');
        S.cell = { gx: +p[0], by: +p[1] };
        S.view = 'inbox';
        render();
        return;
      }

      if (t.id === 'or-new2') { openCompose(); return; }
      if (t.id === 'or-seed')  { seedDemo(); return; }

      var row = t.closest ? t.closest('[data-open]') : null;
      if (row) { e.preventDefault(); openDrawer(row.getAttribute('data-open')); }
    });

    body.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var row = e.target.closest ? e.target.closest('tr[data-open]') : null;
      if (row) { e.preventDefault(); openDrawer(row.getAttribute('data-open')); }
    });
  }

  function wireBar() {
    var bar = $('or-bar'); if (!bar) return;
    bar.addEventListener('click', function (e) {
      var tab = e.target.closest ? e.target.closest('[data-view]') : null;
      if (tab) { S.view = tab.getAttribute('data-view'); S.cell = null; render(); return; }
      if (e.target.id === 'or-new') openCompose();
    });
    bar.addEventListener('change', function (e) {
      if (e.target.id === 'or-show') { S.show = e.target.value; render(); }
      if (e.target.id === 'or-mkt')  { S.market = e.target.value; render(); }
    });
  }

  /* ════════════════════════════════════════════════════════════════════════
     DRAWER — one referral, in full
     ════════════════════════════════════════════════════════════════════════ */

  function ensureDrawer() {
    if ($('or-drawer')) return;
    var scrim = el('div', { id: 'or-scrim' });
    scrim.addEventListener('click', closeDrawer);
    document.body.appendChild(scrim);

    var d = el('div', { id: 'or-drawer', role: 'dialog', 'aria-modal': 'true',
                        'aria-labelledby': 'or-dtitle' });
    d.innerHTML =
      '<div class="dh" style="position:relative">'
        + '<button class="dx" id="or-dclose" aria-label="Close">\u00D7</button>'
        + '<h3 id="or-dtitle"></h3><div class="addr" id="or-daddr"></div>'
      + '</div>'
      + '<div class="db" id="or-dbody"></div>'
      + '<div class="df" id="or-dfoot"></div>';
    document.body.appendChild(d);
    $('or-dclose').addEventListener('click', closeDrawer);

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && S.openId) closeDrawer();
    });
  }

  function openDrawer(id) {
    ensureDrawer(); injectStyles();
    S.openId = id;
    paintDrawer();
    $('or-scrim').classList.add('on');
    $('or-drawer').classList.add('on');
    /* Opening is the tenant looking at it — that IS the state change worth
       recording, so a request stops being "new" the moment somebody reads it.
       Only for the receiving org, so a sender previewing their own referral
       doesn't mark it read on the recipient's behalf. */
    var r = byId(id);
    if (r && r.status === 'new' && r.toOrgId === myOrg()) {
      patch(id, { status: 'reviewing' }, (myName() || 'Someone') + ' opened this request')['catch'](function () {});
    }
    setTimeout(function () { var b = $('or-dclose'); if (b) b.focus(); }, 60);
  }

  function closeDrawer() {
    S.openId = null;
    var s = $('or-scrim'), d = $('or-drawer');
    if (s) s.classList.remove('on');
    if (d) d.classList.remove('on');
  }

  function paintDrawer() {
    var r = byId(S.openId); if (!r) { closeDrawer(); return; }
    $('or-dtitle').textContent = r.siteName || 'Untitled site';
    $('or-daddr').textContent  = r.address || 'No address given';

    var st = statusOf(r.status);
    var docs = (r.docs || []).slice().sort(function (a, b) {
      var oa = DOC_KIND.map(function (k) { return k.key; });
      return oa.indexOf(a.kind) - oa.indexOf(b.kind);
    });

    var html = '';

    /* ── The ask ── */
    html += '<div class="sec"><h4>What they want</h4>'
      + '<div class="ask">' + esc(r.ask || 'No detail given.') + '</div></div>';

    /* ── Site + commercial facts ── */
    html += '<div class="sec"><h4>The site</h4><dl class="kv">'
      + kv('From', (r.fromName || r.fromEmail || '\u2014')
          + (r.fromOrgId ? ' \u00B7 ' + r.fromOrgId : ''))
      /* ago() falls back to a plain date past a fortnight, so on an older
         referral this printed the same date twice. */
      + kv('Received', dateStr(r.createdAt)
          + (ago(r.createdAt) === dateStr(r.createdAt) ? '' : ' \u00B7 ' + ago(r.createdAt)))
      + (r.product    ? kv('Product line', r.product) : '')
      + (sizeLine(r)  ? kv('Size', sizeLine(r)) : '')
      + (r.stage      ? kv('Project stage', r.stage) : '')
      + (r.neededBy   ? kv('Needed by', r.neededBy) : '')
      + kv(axisLabel('grid'), scoreCell(r.gridScore))
      + kv(axisLabel('bankable'), scoreCell(r.bankableScore))
      + (placed(r)
          ? kv('Matrix square', bandLabel(gridBand(r)) + ' \u00D7 ' + bandLabel(bankableBand(r))
              + (inMarket(r) ? ' \u00B7 in the buyer\u2019s market' : ''))
          : kv('Matrix square', 'Not placed \u2014 missing ' + esc(missing(r).join(' and '))))
      + '</dl></div>';

    /* ── Documents ── */
    html += '<div class="sec"><h4>Documents' + (docs.length ? ' (' + docs.length + ')' : '') + '</h4>';
    if (docs.length) {
      html += docs.map(function (d, i) {
        var ext = (d.name || '').split('.').pop().toUpperCase().slice(0, 4) || 'FILE';
        var meta = docKindLabel(d.kind)
          + (d.source === 'link' ? ' \u00B7 link' : (d.size ? ' \u00B7 ' + bytes(d.size) : ''))
          + (d.addedByName ? ' \u00B7 ' + d.addedByName : '');
        return '<a class="doc" href="' + esc(d.url) + '" target="_blank" rel="noopener noreferrer">'
          + '<span class="ic">' + esc(d.source === 'link' ? 'LINK' : ext) + '</span>'
          + '<span class="nm">' + esc(d.name || 'Document')
            + '<span class="mt">' + esc(meta) + '</span></span>'
          + '<button class="rm" data-rmdoc="' + i + '" title="Remove" aria-label="Remove document">\u00D7</button>'
          + '</a>';
      }).join('');
    } else {
      html += '<div style="font-size:12.5px;color:#8895A3;line-height:1.55;margin-bottom:11px">'
        + 'Nothing attached. Add the site map, scope of work or bill of materials here, '
        + 'or paste a Drive or SharePoint link.</div>';
    }
    html += docAdderHtml() + '</div>';

    /* ── The quote ── */
    html += quoteHtml(r);

    /* ── Activity ── */
    var acts = (r.activity || []).slice().sort(function (a, b) { return (b.at || 0) - (a.at || 0); });
    html += '<div class="sec"><h4>Activity</h4>';
    html += acts.length
      ? '<div class="feed">' + acts.map(function (a) {
          return '<div class="ev">' + esc(a.text || '')
            + '<span class="t">' + esc(a.by || '') + ' \u00B7 ' + ago(a.at) + '</span></div>';
        }).join('') + '</div>'
      : '<div style="font-size:12.5px;color:#8895A3">Nothing yet.</div>';
    html += '</div>';

    $('or-dbody').innerHTML = html;

    /* ── Footer: move the status ── */
    $('or-dfoot').innerHTML =
      '<select class="or-sel" id="or-dstatus" aria-label="Status" style="padding:8px 11px">'
      + STATUS.map(function (s) {
          return '<option value="' + s.key + '"' + (s.key === r.status ? ' selected' : '') + '>'
            + s.label + '</option>';
        }).join('')
      + '</select>'
      + '<span class="grow"></span>'
      + (r.fromEmail
          ? '<a class="or-btn pri" style="text-decoration:none;display:inline-block" href="'
            + esc(mailto(r)) + '">Reply to ' + esc((r.fromName || r.fromEmail).split(' ')[0]) + '</a>'
          : '');

    wireDrawer(r);
  }

  function kv(k, v) { return '<dt>' + esc(k) + '</dt><dd>' + v + '</dd>'; }

  function scoreCell(v) {
    var n = num(v);
    return n === null
      ? '<span style="color:#8895A3;font-weight:400">not scored</span>'
      : '<b>' + n + '</b> <span style="color:#8895A3;font-weight:400">/ 99</span>';
  }

  function mailto(r) {
    var q = quoteOf(r);
    var site = r.siteName || 'your site';
    var subj = (q ? 'Quote \u2014 ' : 'Quote request \u2014 ') + site;
    var body = 'Hi ' + ((r.fromName || '').split(' ')[0]) + ',\n\n';
    if (q) {
      body += 'We have priced ' + site + ' at ' + money(q.total, q.currency)
        + (q.product ? ' for ' + q.product : '') + '.'
        + (q.leadTimeWeeks ? ' Lead time is ' + q.leadTimeWeeks + ' weeks.' : '')
        + (q.validUntil ? ' The price holds until ' + q.validUntil + '.' : '')
        + '\n\n'
        + (q.notes ? q.notes + '\n\n' : '')
        + 'The full quote is on the referral in your portal.\n\n';
    } else {
      body += 'Thanks for sending ' + site + ' through to ' + clientName() + '.\n\n';
    }
    return 'mailto:' + encodeURIComponent(r.fromEmail)
      + '?subject=' + encodeURIComponent(subj)
      + '&body=' + encodeURIComponent(body);
  }

  /* ── THE QUOTE ───────────────────────────────────────────────────────────
     The other half of the loop, and the half FENECON actually works. A
     referral arrives asking for a price; this is where the price goes back.

     Only the RECEIVING org sees this form. A sender looking at their own
     referral sees the quote read-only, which matches the Firestore rule —
     their update clause is pinned to docs/activity/updatedAt, so a form here
     would render a button the rules refuse.

     Revising is allowed and keeps the old one: quoteHistory is appended to on
     every send, so "we came down twice on that job" is answerable six months
     later. The customer sees the current figure; you keep the path to it. */
  function amRecipient(r) {
    return r.toOrgId === myOrg() || isAdmin();
  }

  function quoteHtml(r) {
    var q = quoteOf(r);
    var hist = (r.quoteHistory || []).length;
    var out = '<div class="sec"><h4>Quote</h4>';

    if (q) {
      out += '<div class="qbox">'
        + '<div class="qtop"><span class="qnum">' + esc(money(q.total, q.currency)) + '</span>'
        + '<span class="qwhen">sent ' + ago(q.sentAt) + (q.byName ? ' by ' + esc(q.byName) : '') + '</span></div>'
        + '<dl class="kv" style="margin-top:11px">'
          + (q.product        ? kv('Product', esc(q.product)) : '')
          + (q.leadTimeWeeks  ? kv('Lead time', esc(q.leadTimeWeeks) + ' weeks') : '')
          + (q.validUntil     ? kv('Valid until', esc(q.validUntil)) : '')
        + '</dl>'
        + (q.notes ? '<div class="qnotes">' + esc(q.notes) + '</div>' : '')
        + (hist ? '<div class="qhist">' + hist + ' earlier '
                  + (hist === 1 ? 'version' : 'versions') + ' kept</div>' : '')
        + '</div>';
    }

    if (!amRecipient(r)) {
      if (!q) out += '<div class="qnone">' + esc(clientName())
        + ' has not priced this yet.</div>';
      return out + '</div>';
    }

    out += '<div' + (q ? ' style="margin-top:13px"' : '') + '>'
      + (q ? '<div class="qrevise">Revising replaces the figure above. The old one is kept.</div>' : '')
      + '<div class="or-2">'
        + '<div class="or-f"><label for="or-qtotal">Price</label>'
          + '<input id="or-qtotal" type="number" min="0" step="1" placeholder="142000"'
          + ' value="' + (q ? esc(num(q.total)) : '') + '"></div>'
        + '<div class="or-f"><label for="or-qcur">Currency</label><select id="or-qcur">'
          + ['USD', 'EUR', 'GBP'].map(function (c) {
              return '<option value="' + c + '"'
                + ((q && q.currency === c) || (!q && c === 'USD') ? ' selected' : '')
                + '>' + c + '</option>';
            }).join('')
        + '</select></div>'
      + '</div>'
      + '<div class="or-f"><label for="or-qprod">Product</label>'
        + '<input id="or-qprod" type="text" maxlength="90" placeholder="e.g. Commercial 92, two units"'
        + ' value="' + (q ? esc(q.product || '') : '') + '"></div>'
      + '<div class="or-2">'
        + '<div class="or-f"><label for="or-qlead">Lead time (weeks)</label>'
          + '<input id="or-qlead" type="number" min="0" step="1" placeholder="16"'
          + ' value="' + (q ? esc(q.leadTimeWeeks || '') : '') + '"></div>'
        + '<div class="or-f"><label for="or-qvalid">Valid until</label>'
          + '<input id="or-qvalid" type="date" value="' + (q ? esc(q.validUntil || '') : '') + '"></div>'
      + '</div>'
      + '<div class="or-f"><label for="or-qnotes">What this covers</label>'
        + '<textarea id="or-qnotes" maxlength="900" placeholder="Ex-works Deggendorf. Excludes '
        + 'freight, install and commissioning. Assumes outdoor pad and 480V service.">'
        + (q ? esc(q.notes || '') : '') + '</textarea>'
        + '<div class="hint">Say what is excluded. A price without its exclusions gets '
        + 'compared against somebody else\u2019s that had them.</div></div>'
      + '<div class="act">'
        + '<button class="or-btn pri" id="or-qsend" style="padding:9px 17px">'
        + (q ? 'Send revised quote' : 'Send quote') + '</button>'
      + '</div>'
      + '<div class="or-msg" id="or-qmsg"></div>'
      + '</div>';

    return out + '</div>';
  }

  function sendQuote(r) {
    var total = num($('or-qtotal').value);
    if (total === null || total <= 0) {
      msg('or-qmsg', 'Put a price on it. A quote with no number is a status change, not a quote.', 'bad');
      return;
    }
    var q = {
      total:         Math.round(total),
      currency:      $('or-qcur').value,
      product:       ($('or-qprod').value  || '').trim(),
      leadTimeWeeks: num($('or-qlead').value),
      validUntil:    ($('or-qvalid').value || ''),
      notes:         ($('or-qnotes').value || '').trim(),
      byName:        myName(),
      byEmail:       myEmail(),
      sentAt:        Date.now()
    };

    var btn = $('or-qsend'); btn.disabled = true;
    msg('or-qmsg', 'Sending\u2026', '');

    var fields = { quote: q, status: 'quoted' };
    /* Keep the superseded one. arrayUnion rather than a read-modify-write, so
       two people pricing the same job at once cannot drop each other's
       history. */
    var prev = quoteOf(r);
    if (prev) fields.quoteHistory = firebase.firestore.FieldValue.arrayUnion(prev);

    patch(r.id, fields,
      (prev ? 'Revised quote: ' : 'Quote sent: ') + money(q.total, q.currency)
      + (q.leadTimeWeeks ? ', ' + q.leadTimeWeeks + ' week lead time' : ''))
      .then(function () {
        msg('or-qmsg', 'Sent. ' + esc(r.fromName || 'The sender')
          + ' can see it now \u2014 use Reply below to tell them.', 'good');
        btn.disabled = false;
      })['catch'](function (e) {
        btn.disabled = false;
        msg('or-qmsg', 'Could not send: ' + esc(e.message), 'bad');
      });
  }

  /* ── Attach a document, from disk or from a link ── */
  function docAdderHtml() {
    return '<div style="border-top:1px solid #E9EDF1;padding-top:13px;margin-top:11px">'
      + '<div class="or-2">'
        + '<div class="or-f" style="margin-bottom:9px"><label for="or-dkind">Type</label>'
          + '<select id="or-dkind">'
          + DOC_KIND.map(function (k) { return '<option value="' + k.key + '">' + k.label + '</option>'; }).join('')
          + '</select></div>'
        + '<div class="or-f" style="margin-bottom:9px"><label for="or-dlink">Or paste a link</label>'
          + '<input id="or-dlink" type="url" placeholder="Drive, SharePoint, Dropbox\u2026"></div>'
      + '</div>'
      + '<div class="or-drop" id="or-drop" tabindex="0" role="button">'
        + 'Drop a file here, or click to choose \u00B7 PDF, image, XLSX, CSV, DWG'
      + '</div>'
      + '<input type="file" id="or-dfile" style="display:none" accept="' + ACCEPT + '">'
      + '<div class="act"><button class="sbtn" id="or-dlinkadd">Add link</button></div>'
      + '<div class="or-msg" id="or-dmsg"></div>'
      + '</div>';
  }

  function wireDrawer(r) {
    var sel = $('or-dstatus');
    if (sel) sel.addEventListener('change', function () {
      var s = statusOf(this.value);
      patch(r.id, { status: this.value }, 'Status moved to ' + s.label)['catch'](function (e) {
        msg('or-dmsg', 'Could not save: ' + e.message, 'bad');
      });
    });

    var body = $('or-dbody');
    body.addEventListener('click', function (e) {
      var rm = e.target.closest ? e.target.closest('[data-rmdoc]') : null;
      if (rm) {
        e.preventDefault(); e.stopPropagation();
        removeDoc(r, +rm.getAttribute('data-rmdoc'));
        return;
      }
      if (e.target.id === 'or-drop') $('or-dfile').click();
      if (e.target.id === 'or-dlinkadd') addLink(r);
      if (e.target.id === 'or-qsend') sendQuote(r);
    });

    var drop = $('or-drop');
    if (drop) {
      ['dragenter', 'dragover'].forEach(function (ev) {
        drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('over'); });
      });
      ['dragleave', 'drop'].forEach(function (ev) {
        drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('over'); });
      });
      drop.addEventListener('drop', function (e) {
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) upload(r, e.dataTransfer.files[0]);
      });
      drop.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('or-dfile').click(); }
      });
    }

    var f = $('or-dfile');
    if (f) f.addEventListener('change', function () { if (this.files[0]) upload(r, this.files[0]); });
  }

  function msg(id, text, tone) {
    var n = $(id); if (!n) return;
    n.className = 'or-msg ' + (tone || '');
    n.innerHTML = text;
  }

  function addLink(r) {
    var url = ($('or-dlink').value || '').trim();
    if (!url) { msg('or-dmsg', 'Paste a link first.', 'bad'); return; }
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    var kind = $('or-dkind').value;
    var name = docKindLabel(kind);
    try { name = decodeURIComponent(url.split('/').filter(Boolean).pop() || name).slice(0, 80); } catch (e) {}

    addDoc(r, { kind: kind, name: name, url: url, source: 'link' });
  }

  function addDoc(r, doc) {
    doc.addedBy = myEmail();
    doc.addedByName = myName();
    doc.addedAt = Date.now();
    var d = db();
    d.collection('referrals').doc(r.id).update({
      docs: firebase.firestore.FieldValue.arrayUnion(doc),
      updatedAt: stamp(),
      activity: firebase.firestore.FieldValue.arrayUnion({
        at: Date.now(), by: myName() || myEmail(), byEmail: myEmail(),
        text: 'Attached ' + docKindLabel(doc.kind).toLowerCase() + ': ' + doc.name
      })
    }).then(function () {
      msg('or-dmsg', 'Attached.', 'good');
      setTimeout(repaintDrawer, 350);
    })['catch'](function (e) { msg('or-dmsg', 'Could not attach: ' + esc(e.message), 'bad'); });
  }

  function removeDoc(r, i) {
    var docs = (r.docs || []).slice();
    var gone = docs.splice(i, 1)[0]; if (!gone) return;
    db().collection('referrals').doc(r.id).update({
      docs: docs, updatedAt: stamp(),
      activity: firebase.firestore.FieldValue.arrayUnion({
        at: Date.now(), by: myName() || myEmail(), byEmail: myEmail(),
        text: 'Removed ' + (gone.name || 'a document')
      })
    }).then(function () { setTimeout(repaintDrawer, 300); })
     ['catch'](function (e) { msg('or-dmsg', 'Could not remove: ' + esc(e.message), 'bad'); });
  }

  /* ── Upload ──────────────────────────────────────────────────────────────
     firebase-storage-compat is NOT loaded by index.html, so pull it on first
     use rather than adding a fourth SDK tag to every page load for a feature
     most sessions never touch. */
  var _storageLoading = null;
  function storage() {
    if (global.firebase && firebase.storage) return Promise.resolve(firebase.storage());
    if (_storageLoading) return _storageLoading;
    _storageLoading = new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = 'https://www.gstatic.com/firebasejs/9.23.0/firebase-storage-compat.js';
      s.onload  = function () { try { res(firebase.storage()); } catch (e) { rej(e); } };
      s.onerror = function () { rej(new Error('Storage SDK failed to load.')); };
      document.head.appendChild(s);
    });
    return _storageLoading;
  }

  function upload(r, file) {
    var max = cfg().maxUploadMb * 1048576;
    if (file.size > max) {
      msg('or-dmsg', esc(file.name) + ' is ' + bytes(file.size) + '. The ceiling is '
        + cfg().maxUploadMb + 'MB \u2014 put it on Drive and paste the link instead.', 'bad');
      return;
    }
    var kind = $('or-dkind').value;
    S.uploading = true;
    msg('or-dmsg', 'Uploading ' + esc(file.name) + '\u2026', '');

    storage().then(function (st) {
      var safe = file.name.replace(/[^\w.\- ]+/g, '_').slice(0, 120);
      var path = 'referrals/' + (r.toOrgId || orgId()) + '/' + r.id + '/' + Date.now() + '-' + safe;
      var ref = st.ref(path);
      var task = ref.put(file, { contentType: file.type || 'application/octet-stream' });

      task.on('state_changed', function (snap) {
        var pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
        msg('or-dmsg', 'Uploading ' + esc(file.name) + '\u2026 ' + pct + '%', '');
      }, function (e) {
        S.uploading = false;
        msg('or-dmsg', e.code === 'storage/unauthorized'
          ? 'Upload refused. The Storage rule for <b>referrals/**</b> has not been deployed \u2014 '
            + 'see the foot of omega-referrals.js. Pasting a Drive link works in the meantime.'
          : 'Upload failed: ' + esc(e.message), 'bad');
      }, function () {
        ref.getDownloadURL().then(function (url) {
          S.uploading = false;
          addDoc(r, { kind: kind, name: file.name, url: url, source: 'upload',
                      size: file.size, path: path, contentType: file.type || '' });
        });
      });
    })['catch'](function (e) { S.uploading = false; msg('or-dmsg', esc(e.message), 'bad'); });

    $('or-dfile').value = '';
  }

  /* ════════════════════════════════════════════════════════════════════════
     COMPOSE — send a referral
     The other half of the loop. A developer or a ClearSky admin has a site and
     wants a price; this is where they send it. The receiving org is the field
     that matters, and it defaults to this deployment's tenant so the common
     case is one click.
     ════════════════════════════════════════════════════════════════════════ */

  function ensureCompose() {
    if ($('or-compose')) return;
    var m = el('div', { id: 'or-compose', role: 'dialog', 'aria-modal': 'true',
                        'aria-labelledby': 'or-ctitle' });
    m.innerHTML =
      '<div class="cc">'
        + '<div class="ch"><h3 id="or-ctitle">Send a referral</h3>'
          + '<p>Pass a site to ' + esc(clientName()) + ' for a quote. Give them the address, '
          + 'what you need priced, and whatever you already have \u2014 site map, scope, bill of materials.</p></div>'
        + '<div class="cb">'
          + '<div class="or-f"><label for="or-c-site">Site name</label>'
            + '<input id="or-c-site" type="text" placeholder="e.g. 800 Progress Dr" maxlength="120"></div>'
          + '<div class="or-f"><label for="or-c-addr">Address</label>'
            + '<input id="or-c-addr" type="text" placeholder="Street, city, state, ZIP" maxlength="200"></div>'
          + '<div class="or-f"><label for="or-c-ask">What do you need priced?</label>'
            + '<textarea id="or-c-ask" maxlength="1400" placeholder="Budgetary price on a commercial BESS for peak shaving. '
            + 'Roughly 500kW / 2MWh, outdoor pad, utility is ComEd. Need it for a proposal in three weeks."></textarea></div>'
          + '<div class="or-2">'
            + '<div class="or-f"><label for="or-c-kw">Power (kW)</label>'
              + '<input id="or-c-kw" type="number" min="0" step="1" placeholder="500"></div>'
            + '<div class="or-f"><label for="or-c-kwh">Energy (kWh)</label>'
              + '<input id="or-c-kwh" type="number" min="0" step="1" placeholder="2000"></div>'
          + '</div>'
          + '<div class="or-2">'
            + '<div class="or-f"><label for="or-c-grid">' + esc(axisLabel('grid')) + '</label>'
              + '<input id="or-c-grid" type="number" min="0" max="99" step="1" placeholder="0\u201399">'
              + '<div class="hint">Leave blank if it has not been scored. It will sit in '
              + '\u201cWaiting for a score\u201d rather than being placed wrongly.</div></div>'
            + '<div class="or-f"><label for="or-c-bank">' + esc(axisLabel('bankable')) + '</label>'
              + '<input id="or-c-bank" type="number" min="0" max="99" step="1" placeholder="0\u201399"></div>'
          + '</div>'
          + '<div class="or-2">'
            + '<div class="or-f"><label for="or-c-need">Needed by</label>'
              + '<input id="or-c-need" type="date"></div>'
            + '<div class="or-f"><label for="or-c-to">Send to</label>'
              + '<input id="or-c-to" type="text" value="' + esc(orgId()) + '">'
              + '<div class="hint">The receiving workspace.</div></div>'
          + '</div>'
          + '<div class="or-msg" id="or-cmsg"></div>'
        + '</div>'
        + '<div class="cf">'
          + '<span style="font-size:12px;color:#8895A3">Attach documents after sending.</span>'
          + '<span class="grow"></span>'
          + '<button class="or-btn sec" id="or-ccancel">Cancel</button>'
          + '<button class="or-btn pri" id="or-csend">Send referral</button>'
        + '</div>'
      + '</div>';
    document.body.appendChild(m);

    m.addEventListener('click', function (e) {
      if (e.target === m || e.target.id === 'or-ccancel') closeCompose();
      if (e.target.id === 'or-csend') send();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && m.classList.contains('on')) closeCompose();
    });
  }

  function openCompose() {
    injectStyles(); ensureCompose();
    $('or-compose').classList.add('on');
    setTimeout(function () { var i = $('or-c-site'); if (i) i.focus(); }, 60);
  }

  function closeCompose() {
    var m = $('or-compose'); if (m) m.classList.remove('on');
  }

  function send() {
    var site = ($('or-c-site').value || '').trim();
    var addr = ($('or-c-addr').value || '').trim();
    var ask  = ($('or-c-ask').value  || '').trim();
    var to   = ($('or-c-to').value   || '').trim().toLowerCase();

    if (!site && !addr) { msg('or-cmsg', 'Give the site a name or an address \u2014 without one it cannot be told apart from anything else.', 'bad'); return; }
    if (!ask)  { msg('or-cmsg', 'Say what you need priced. A referral with no ask gets ignored.', 'bad'); return; }
    if (!to)   { msg('or-cmsg', 'Name the workspace this is going to.', 'bad'); return; }

    var btn = $('or-csend'); btn.disabled = true;
    msg('or-cmsg', 'Sending\u2026', '');

    var g = num($('or-c-grid').value), b = num($('or-c-bank').value);
    var rec = {
      toOrgId:    to,
      fromOrgId:  myOrg(),
      fromEmail:  myEmail(),
      fromName:   myName(),
      fromUid:    (me() && me().uid) || '',
      siteName:   site || addr,
      address:    addr,
      ask:        ask,
      powerKw:    num($('or-c-kw').value),
      energyKwh:  num($('or-c-kwh').value),
      neededBy:   ($('or-c-need').value || ''),
      gridScore:     g === null ? null : Math.max(0, Math.min(99, Math.round(g))),
      bankableScore: b === null ? null : Math.max(0, Math.min(99, Math.round(b))),
      status:     'new',
      docs:       [],
      activity:   [{ at: Date.now(), by: myName() || myEmail(), byEmail: myEmail(),
                     text: 'Referral sent' }],
      createdAt:  stamp(),
      updatedAt:  stamp()
    };

    db().collection('referrals').add(rec).then(function (ref) {
      btn.disabled = false;
      closeCompose();
      ['or-c-site','or-c-addr','or-c-ask','or-c-kw','or-c-kwh','or-c-grid','or-c-bank','or-c-need']
        .forEach(function (id) { var n = $(id); if (n) n.value = ''; });
      msg('or-cmsg', '', '');
      /* If it came to us, it's already in S via the listener — open it so the
         sender can attach documents immediately. */
      if (to === orgId()) setTimeout(function () { openDrawer(ref.id); }, 400);
    })['catch'](function (e) {
      btn.disabled = false;
      msg('or-cmsg', e.code === 'permission-denied'
        ? 'Refused. The Firestore rule for <b>referrals</b> has not been deployed \u2014 '
          + 'see the foot of omega-referrals.js.'
        : 'Could not send: ' + esc(e.message), 'bad');
    });
  }

  /* ════════════════════════════════════════════════════════════════════════
     DEMO SEED
     Off unless referrals.demoSeed is true in config.js. One click writes a
     portfolio and an inbox so a trial account has something to show, instead
     of a console procedure with a text editor in the middle of it.

     ── WHAT IT WRITES AS ──
     Everything is stamped with the SIGNED-IN USER, because that is the only
     thing the rules allow and the only thing that makes the dashboard's
     mine/company toggle behave. Sign in as the account you will present from.

     Referrals need a sender org that is not the tenant, or the From column
     reads "fenecon.com" on every row and it looks like FENECON referring
     sites to itself. ClearSky staff get that for free — isOmegaStaff() lets
     them file on anyone's behalf. A tenant user cannot, so the button says so
     rather than quietly producing a worse demo.

     ── IT REFUSES TO RUN TWICE ──
     Seeded records carry demo:true / seed:true. If any already exist the
     button reports the count and stops, because a second click would double
     every number on the dashboard and the duplicate banner would start firing
     on rows nobody entered twice.
     ════════════════════════════════════════════════════════════════════════ */

  var DEMO_SITES = [
    { name:'Frederick Distribution Center', address:'800 Progress Dr, Frederick, MD 21701',
      client:'Progress Logistics LLC', type:'bess', stage:'interconnect',
      bessKwh:2000, capex:1180000, incentive:354000, annualRevenue:268000, quoted:true,
      utility:'Potomac Edison', program:'MD Energy Storage Pilot',
      nextAction:'Utility study fee due Sep 19' },
    { name:'Cedar Rapids Data Center \u2014 Phase 1', address:'2200 Edgewood Rd SW, Cedar Rapids, IA 52404',
      client:'Meridian Compute', type:'bess', stage:'package',
      bessKwh:20000, capex:9400000, incentive:2820000, annualRevenue:1940000, quoted:false,
      utility:'Alliant Energy', program:'MISO capacity',
      nextAction:'One-line to AHJ for pre-review' },
    { name:'Vista Cold Storage', address:'1395 Park Center Dr, Vista, CA 92081',
      client:'Harborline Foods', type:'bess', stage:'permitting',
      bessKwh:4800, capex:2640000, incentive:792000, annualRevenue:611000, quoted:true,
      utility:'SDG&E', program:'SGIP \u2014 General Market',
      nextAction:'Fire clearance letter outstanding' },
    { name:'LivAway Suites Thornton', address:'12176 Grant Circle, Thornton, CO 80241',
      client:'LivAway Hospitality', type:'bess', stage:'finance',
      bessKwh:368, capex:214500, incentive:64350, annualRevenue:47800, quoted:true,
      utility:'Xcel Energy', program:'Demand management',
      nextAction:'Term sheet out for signature' },
    { name:'Clinton Riverfront Retrofit', address:'330 Roberts St, Clinton, IA 52732',
      client:'S.J Burns LLC', type:'bess', stage:'candidate',
      bessKwh:180, capex:118000, incentive:35400, annualRevenue:21400, quoted:false,
      utility:'Alliant Energy', program:'\u2014',
      nextAction:'Waiting on 12 months of bills' }
  ];

  var DAY = 86400000;

  /* Chosen to exercise every state the block renders: one new and scored and
     in the buyer's market with documents, one mid-flight, one already priced
     so the quote panel and "Out for quote" have data, one unscored so
     "Waiting for a score" is not empty, a near-duplicate of it so the
     duplicate banner fires, and one strong on bankability but weak on grid so
     a square sits OUTSIDE the good corner. */
  var DEMO_REFERRALS = [
    { siteName:'800 Progress Dr', address:'800 Progress Dr, Frederick MD 21701',
      ask:'Budgetary price on a commercial BESS for peak shaving. Roughly 500kW / 2MWh, '
        + 'outdoor pad, utility is Potomac Edison. Need it for a customer proposal in three weeks.',
      powerKw:500, energyKwh:2000, product:'Commercial 100', stage:'Pre-development',
      gridScore:74, bankableScore:81, neededBy:'2026-09-25', status:'new', ageDays:0.04,
      senderOrg:'clearsky-usa.com', senderName:'Thomas Gilmer',
      docs:[{kind:'sitemap',name:'800-progress-sitemap.pdf'},{kind:'bom',name:'BOM-rev-C.xlsx'}] },

    { siteName:'Cedar Rapids DC Phase 1', address:'2200 Edgewood Rd SW, Cedar Rapids IA 52404',
      ask:'Industrial XL, four-hour duration, bridging load for a data centre build. '
        + 'Indicative pricing plus a realistic lead time before we commit to the interconnect.',
      powerKw:5000, energyKwh:20000, product:'Industrial XL', stage:'Pre-development',
      gridScore:88, bankableScore:76, status:'reviewing', ageDays:4,
      senderOrg:'clearsky-usa.com', senderName:'Grant Ellery',
      docs:[{kind:'oneline',name:'oneline-r3.pdf'}] },

    { siteName:'1395 Park Center Dr', address:'1395 Park Center Dr, Vista CA 92081',
      ask:'Cold-storage facility, demand charges are brutal. Industrial L sizing. '
        + 'Pricing plus lead time, and whether you can hit a Q1 delivery.',
      powerKw:1200, energyKwh:4800, product:'Industrial L', stage:'Qualified',
      gridScore:63, bankableScore:66, status:'quoting', ageDays:8,
      senderOrg:'csebuilders.com', senderName:'CSE Builders',
      docs:[{kind:'bill',name:'SDGE-12mo.pdf'}] },

    { siteName:'LivAway Suites, Thornton', address:'12176 Grant Circle, Thornton CO 80241',
      ask:'Hotel back-up plus demand management. Commercial 92, roof-adjacent pad. '
        + 'Owner wants a firm number before the board meets.',
      powerKw:92, energyKwh:368, product:'Commercial 92', stage:'Referred',
      gridScore:38, bankableScore:91, status:'quoted', ageDays:20,
      senderOrg:'clearsky-usa.com', senderName:'Thomas Gilmer',
      quote:{ total:214500, currency:'USD', product:'Commercial 92, one unit',
              leadTimeWeeks:16, validUntil:'2026-10-15',
              notes:'Ex-works Deggendorf. Excludes freight, install and commissioning. '
                  + 'Assumes outdoor pad and existing 480V service.' },
      docs:[{kind:'scope',name:'scope-of-work-v2.pdf'}] },

    { siteName:'S.J Burns LLC (330 Roberts)', address:'330 Roberts St, Clinton IA 52732',
      ask:'Home 20/30 stack for a multi-tenant retrofit. Ballpark only at this stage.',
      powerKw:60, energyKwh:180, product:'Home 30', stage:'Referred',
      gridScore:null, bankableScore:null, status:'new', ageDays:2,
      senderOrg:'csebuilders.com', senderName:'CSE Builders', docs:[] },

    { siteName:'SJ Burns \u2013 330 Roberts', address:'330 Roberts Street, Clinton, IA 52732',
      ask:'Retrofit at the Roberts St building. Need a number on a Home 30 stack.',
      powerKw:60, energyKwh:180, stage:'Referred',
      gridScore:null, bankableScore:52, status:'new', ageDays:1.5,
      senderOrg:'csebuilders.com', senderName:'CSE Builders', docs:[] }
  ];

  function seedNote(txt, tone) {
    var n = $('or-seedhint'); if (!n) return;
    n.className = 'or-seedhint' + (tone === 'bad' ? ' bad' : '');
    n.innerHTML = txt;
  }

  function seedDemo() {
    var d = db(), u = me();
    if (!d || !u) { seedNote('Not signed in yet \u2014 wait a moment and try again.', 'bad'); return; }

    var btn = $('or-seed'); btn.disabled = true; btn.textContent = 'Checking\u2026';
    var staff = isAdmin();

    /* Refuse a second run. Cheaper and clearer than de-duplicating after. */
    d.collection('projects').where('orgId', '==', orgId()).get().then(function (snap) {
      var already = 0;
      snap.forEach(function (doc) { if ((doc.data() || {}).demo === true) already++; });
      var seededRefs = S.rows.filter(function (r) { return r.seed === true; }).length;

      if (already || seededRefs) {
        btn.disabled = false; btn.textContent = 'Load demo data';
        seedNote('Already seeded \u2014 ' + already + ' site' + (already === 1 ? '' : 's')
          + ' and ' + seededRefs + ' referral' + (seededRefs === 1 ? '' : 's')
          + ' are here. Clear them from the Firebase console (filter <code>demo</code> '
          + 'or <code>seed</code> is true) before loading again.', 'bad');
        return;
      }
      return run(staff);
    })['catch'](function (e) {
      btn.disabled = false; btn.textContent = 'Load demo data';
      seedNote('Could not check for existing data: ' + esc(e.message), 'bad');
    });

    function run(isStaff) {
      var d = db(), email = myEmail(), name = myName(), org = orgId(), writes = [];
      var mine = myOrg();

      btn.textContent = 'Loading\u2026';
      seedNote('Writing five sites and six quote requests\u2026');

      DEMO_SITES.forEach(function (s) {
        writes.push(d.collection('projects').add({
          uid: u.uid, orgId: org, ownerEmail: email, ownerName: name,
          name: s.name, address: s.address, client: s.client,
          type: s.type, stage: s.stage,
          bessKwh: s.bessKwh, capex: s.capex, incentive: s.incentive,
          annualRevenue: s.annualRevenue, quoted: s.quoted,
          utility: s.utility, program: s.program, nextAction: s.nextAction,
          /* The four arrays the editor expects to exist. Empty on purpose:
             its canvas schema is not something to guess at, and a plan that
             renders wrong in front of a customer is worse than a clean one. */
          elements: [], conduits: [], bessList: [], annotations: [],
          demo: true,
          createdAt: stamp(), updatedAt: stamp()
        }));
      });

      DEMO_REFERRALS.forEach(function (r) {
        var at = Date.now() - Math.round(r.ageDays * DAY);
        /* fromOrgId MUST equal userOrg() unless the caller is staff — the
           create rule compares them. A tenant user therefore seeds referrals
           that appear to come from their own org; the hint below says so. */
        var from = isStaff ? r.senderOrg : mine;
        writes.push(
          d.collection('referrals').add({
            toOrgId: org, fromOrgId: from,
            fromEmail: email, fromName: isStaff ? r.senderName : name, fromUid: u.uid,
            siteName: r.siteName, address: r.address, ask: r.ask,
            powerKw: r.powerKw || null, energyKwh: r.energyKwh || null,
            product: r.product || '', stage: r.stage || '', neededBy: r.neededBy || '',
            gridScore: r.gridScore, bankableScore: r.bankableScore,
            /* The create clause pins status to 'new' and refuses pre-attached
               documents, so the real state is a second write below. Working
               around that would mean seeding data the product itself could
               never produce. */
            status: 'new', docs: [],
            activity: [{ at: at, by: isStaff ? r.senderName : name,
                         byEmail: email, text: 'Referral sent' }],
            seed: true,
            createdAt: stamp(), updatedAt: stamp()
          }).then(function (ref) {
            var after = { updatedAt: stamp() }, touched = false;
            if (r.docs && r.docs.length) {
              after.docs = r.docs.map(function (x) {
                return { kind: x.kind, name: x.name, source: 'link',
                         url: 'https://example.com/sample/' + x.name,
                         addedBy: email, addedByName: name, addedAt: at };
              });
              touched = true;
            }
            if (r.status !== 'new') { after.status = r.status; touched = true; }
            if (r.quote) {
              after.quote = {
                total: r.quote.total, currency: r.quote.currency,
                product: r.quote.product, leadTimeWeeks: r.quote.leadTimeWeeks,
                validUntil: r.quote.validUntil, notes: r.quote.notes,
                byName: name, byEmail: email, sentAt: at + 9 * DAY
              };
              touched = true;
            }
            return touched ? d.collection('referrals').doc(ref.id).update(after) : null;
          })
        );
      });

      return Promise.all(writes).then(function () {
        seedNote('Done. Reloading so the portfolio picks it up\u2026');
        setTimeout(function () { global.location.reload(); }, 900);
      })['catch'](function (e) {
        btn.disabled = false; btn.textContent = 'Load demo data';
        seedNote(e.code === 'permission-denied'
          ? 'Refused. Either the <code>referrals</code> rule is not deployed, or your '
            + 'address does not resolve to <code>' + esc(org) + '</code>.'
          : 'Failed: ' + esc(e.message), 'bad');
      });
    }
  }

  /* ════════════════════════════════════════════════════════════════════════
     MOUNT
     Inserted as a .dash-block inside #dev-fixed, which means DASH picks it up
     for free: it can be dragged, hidden and reordered like every other block,
     and that state persists per user in dashboard_layouts. It goes directly
     after the applications block so it reads before the portfolio numbers —
     an unanswered quote request is more urgent than a chart.
     ════════════════════════════════════════════════════════════════════════ */

  function mount() {
    if ($('or-block')) return true;
    var on = cfg().enabled;
    if (on === 'unknown') return false;  /* keep polling until we know who this is */
    if (!on) return true;                /* not this tenant's block — stop polling */
    var host = $('dev-fixed'); if (!host) return false;

    injectStyles();

    var block = el('div', { 'class': 'dash-block', 'data-block': 'referrals', id: 'or-block' });
    block.innerHTML =
      '<div class="block-head">'
        + '<div>'
          + '<div class="block-title">Referrals<span class="cnt" id="or-count" style="display:none">0</span></div>'
          + '<div class="block-sub" id="or-sub"></div>'
        + '</div>'
      + '</div>'
      + '<div class="or-bar" id="or-bar"></div>'
      + '<div id="or-body"><div class="or-empty">Loading referrals\u2026</div></div>';

    var apps = host.querySelector('.dash-block[data-block="apps"]');
    if (apps && apps.nextSibling) host.insertBefore(block, apps.nextSibling);
    else if (apps) host.appendChild(block);
    else host.insertBefore(block, host.firstChild);

    wireBar();
    paintHead();

    /* Re-apply the saved layout so a user who dragged or hid this block keeps
       their arrangement — mount() runs after DASH has already applied once. */
    try { if (global.DASH && DASH.apply) DASH.apply(); } catch (e) {}
    return true;
  }

  /* The dashboard renders only after auth resolves, and #dev-fixed is present
     from first paint but empty of meaning until then. Poll briefly for both
     the host and a signed-in user, exactly as omega-terms.js does. */
  function boot(n) {
    var ok = mount();
    var u  = me();
    if (ok && u && orgId()) { listen(); return; }
    if (n > 200) return;                       // ~20s, then give up quietly
    setTimeout(function () { boot(n + 1); }, 100);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { boot(0); });
  } else {
    boot(0);
  }

  /* Re-listen on sign-out/sign-in without a reload. */
  try {
    if (global.firebase && firebase.auth) {
      firebase.auth().onAuthStateChanged(function (u) {
        if (u && orgId()) { mount(); listen(); }
        else if (_unsub) { try { _unsub(); } catch (e) {} _unsub = null; S.rows = []; S.ready = false; render(); }
      });
    }
  } catch (e) {}

  global.OmegaReferrals = {
    open:    openDrawer,
    compose: openCompose,
    refresh: listen,
    rows:    function () { return S.rows.slice(); }
  };

})(typeof window !== 'undefined' ? window : this);


/* ══════════════════════════════════════════════════════════════════════════
   REQUIRED FIRESTORE RULE — add to firestore.rules and DEPLOY.
   Without it every read is denied and the block renders an error line.

   Referrals are the one cross-tenant object on the platform, so the rule is
   the whole security story: a referral is readable by the org that SENT it and
   the org it was SENT TO, and by nobody else.

     function userOrg() {
       // Must match the helper the rest of your rules already use, including
       // the domain aliasing (fenecon.de / fenecon.us -> fenecon.com). If it
       // derives orgId from the raw email domain, aliased users will see an
       // empty inbox — see the note in README.md under Access rules.
       return request.auth.token.email.split('@')[1];
     }

     match /referrals/{id} {
       allow read: if request.auth != null
                   && (resource.data.toOrgId   == userOrg()
                    || resource.data.fromOrgId == userOrg());

       // Anyone signed in may send one, but only truthfully: the sender fields
       // must be their own, and a referral always starts at 'new'. Without the
       // fromEmail check, one user could send referrals in another's name.
       allow create: if request.auth != null
                     && request.resource.data.fromEmail == request.auth.token.email
                     && request.resource.data.fromOrgId == userOrg()
                     && request.resource.data.toOrgId is string
                     && request.resource.data.status == 'new';

       // The RECEIVING org works the referral: status, documents, activity.
       // The sending org may add documents but must not move the status —
       // otherwise a sender could mark their own request 'won'.
       allow update: if request.auth != null
                     && resource.data.toOrgId == userOrg()
                     && request.resource.data.toOrgId   == resource.data.toOrgId
                     && request.resource.data.fromOrgId == resource.data.fromOrgId;

       allow update: if request.auth != null
                     && resource.data.fromOrgId == userOrg()
                     && request.resource.data.status  == resource.data.status
                     && request.resource.data.toOrgId == resource.data.toOrgId;

       // Referrals are a record of who asked for what and when. Close them,
       // don't delete them.
       allow delete: if false;
     }

   ── STORAGE RULE — add to storage.rules and deploy with
      firebase deploy --only storage
   Without it uploads return storage/unauthorized. Link attachments still work,
   so the block degrades to links-only rather than breaking.

     match /referrals/{orgId}/{referralId}/{file} {
       // Reads are open to any signed-in user because the download URL is
       // already an unguessable token; the Firestore rule above is what keeps
       // the URL itself out of the wrong hands.
       allow read:  if request.auth != null;
       allow write: if request.auth != null
                    && request.resource.size < 25 * 1024 * 1024;
     }

   ── ONE LINE IN index.html
   Load it after config.js and omega-brand.js, alongside omega-terms.js:

     <script src="/omega-referrals.js"></script>

   Nothing else in index.html changes. Both files are shared platform files —
   patch them upstream and copy down, never here, or the tenant repo forks.
   ══════════════════════════════════════════════════════════════════════════ */
