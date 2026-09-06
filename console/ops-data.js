/* ═══════════════════════════════════════════════════════════════════════════════
   ClearSky-OMEGA · Ops Data Layer  (v2)
   © 2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   INTERNAL REPO ONLY. Not shared with tenant deployments.

   ─────────────────────────────────────────────────────────────────────────────
   WHAT CHANGED IN v2, AND WHY
   ─────────────────────────────────────────────────────────────────────────────
   v1 read a collection called `intake_requests` that this console invented for
   itself. That was a mistake: the real intake already existed at
   tools.csebuilders.com/intake.html and writes to `intake_projects`. Two
   collections meant a client could submit a job the ops console never saw —
   which is exactly what happened to the sunesol record.

   v2 reads `intake_projects`. One queue, the same one intake-admin.html works.

   v2 also stops being TOLD what the tenants are. They are DISCOVERED, in this
   order of preference:

     1. the `omega_orgs` collection — the registry that already exists
     2. orgIds observed on actual intake records
     3. `ops.tenantNames` in config.js — display-name overrides only

   Adding a customer therefore costs nothing here. Stand up their repo, let
   them submit, and they appear. No edit to this repo, no redeploy.

   ─────────────────────────────────────────────────────────────────────────────
   FIELD TOLERANCE
   ─────────────────────────────────────────────────────────────────────────────
   The exact shape written by omega-intake.js hasn't been read directly, so
   every field below resolves through pick() against several candidate paths.
   Where nothing matches, the drawer shows the raw document rather than
   rendering a blank — a wrong guess is then visible and correctable instead of
   silently losing data. Tighten the candidate lists once the real field names
   are confirmed; nothing else needs to change.
   ═══════════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var HOUR = 3600000, DAY = 86400000;

  /* ── Status model ────────────────────────────────────────────────────────
     These are intake_projects' OWN statuses, taken from clientStatus() and
     clientStatusMove() in the Firestore rules. The console deliberately does
     not invent new ones: intake-admin.html reads the same records, and a
     status it doesn't recognise would render as an unknown state there.

     'draft' and 'saved' are pre-submission — the client is still typing. Not
     work, so they stay out of the queue and out of every average.            */
  var STATUS = [
    { key:'draft',            label:'Draft',            short:'Draft',    color:'#9CA3AF', pipeline:false, pre:true,
      hint:'Not submitted yet. The client is still filling it in.' },
    { key:'saved',            label:'Saved (self-serve)',short:'Saved',   color:'#9CA3AF', pipeline:false, pre:true,
      hint:'Kept as the client\u2019s own record. Never sent to Omega.' },
    { key:'submitted',        label:'Submitted',        short:'New',      color:'#0070F2', pipeline:true,
      hint:'Received. Nobody has picked it up \u2014 the response clock is running.' },
    { key:'in_review',        label:'In review',        short:'Review',   color:'#6366F1', pipeline:true,
      hint:'Reviewing the inputs to price the work.' },
    { key:'quoted',           label:'Quote sent',       short:'Quoted',   color:'#8B5CF6', pipeline:true,
      hint:'A fee quote is with the client, waiting on approval.' },
    { key:'changes_requested',label:'Needs client input',short:'Blocked', color:'#D97706', pipeline:false,
      hint:'Waiting on something from the client. Off the board until they reply.' },
    { key:'accepted',         label:'Accepted',         short:'Accepted', color:'#0EA5E9', pipeline:true,
      hint:'Quote accepted, work scheduled. Ready to build.' },
    { key:'in_production',    label:'In production',    short:'Building', color:'#00A9A4', pipeline:true,
      hint:'Drawings and packages being produced. Linked to an editor project.' },
    { key:'delivered',        label:'Delivered',        short:'Delivered',color:'#16A34A', pipeline:true,
      hint:'Complete, files attached. Commission is payable.' },
    { key:'declined',         label:'Quote declined',   short:'Declined', color:'#DC2626', pipeline:false,
      hint:'Client declined the quote. No commission.' }
  ];

  /* A 'build' intake is the client opening their own project, no fee. Real,
     but not OUR work and it never pays, so it stays out of the delivery
     queue by default. Set ops.serviceOnly:false to include it. */
  var PURPOSE = {
    service: { label:'Omega builds it',   billable:true  },
    build:   { label:'Client self-serve', billable:false }
  };

  /* The six site scopes from omega-intake.js SCOPES. An intake can carry
     more than one — `scope` is a map of key -> {enabled}, not a single type. */
  var TYPES = [
    { key:'l2',      label:'Level 2 charging',            short:'L2' },
    { key:'dcfc',    label:'DC fast charging',            short:'DCFC' },
    { key:'bess',    label:'Battery storage',             short:'BESS' },
    { key:'der',     label:'Distributed energy resources',short:'DER' },
    { key:'solar',   label:'Solar PV',                    short:'Solar' },
    { key:'compute', label:'Compute / data center',       short:'Compute' },
    /* Editor-only. The intake form has no such scope, so these never appear
       on an intake record — they exist because a site drawn in the editor
       routinely carries generation and charging the intake never asked
       about, and screening that dropped them would under-report the site. */
    { key:'powergen',label:'On-site generation',          short:'Powergen' },
    { key:'charging',label:'EV charging',                 short:'Charging' }
  ];

  /* Mirrors the deliverables ledger on the intake form. */
  /* The seven deliverables, keys exactly as omega-intake.js writes them.
     Getting these wrong renders every requested package as "Siteplan". */
  var SCOPE = [
    { key:'siteplan',    label:'Project plot & site plan' },
    { key:'sitemap',     label:'Site map' },
    { key:'costs',       label:'Cost estimate & BOM' },
    { key:'loadstudy',   label:'Load study & one-line' },
    { key:'utility',     label:'Utility submission package' },
    { key:'interconnect',label:'Interconnection application' },
    { key:'ahj',         label:'AHJ permit package' }
  ];

  var PRIORITY = [
    { key:'critical', label:'Critical', color:'#DC2626' },
    { key:'rush',     label:'Rush',     color:'#D97706' },
    { key:'standard', label:'Standard', color:'#556B82' }
  ];

  function statusOf(key) {
    for (var i = 0; i < STATUS.length; i++) if (STATUS[i].key === key) return STATUS[i];
    return { key:key || 'unknown', label:key || 'Unknown', short:key || '?',
             color:'#6B7280', pipeline:false, hint:'' };
  }
  /* omega-intake.js seeds admin.priority as 'normal', not 'standard', and the
     admin console has no UI to change it — so in practice everything arrives
     'normal'. Fold the likely vocabularies onto our three rather than treating
     an unmapped value as an unknown priority with no SLA. */
  var PRIORITY_ALIAS = {
    normal:'standard', medium:'standard', low:'standard', standard:'standard',
    high:'rush', rush:'rush', urgent:'critical', critical:'critical', emergency:'critical'
  };
  function priorityKey(raw) {
    return PRIORITY_ALIAS[String(raw || '').toLowerCase()] || 'standard';
  }
  function priorityOf(key) {
    var k = priorityKey(key);
    for (var i = 0; i < PRIORITY.length; i++) if (PRIORITY[i].key === k) return PRIORITY[i];
    return PRIORITY[2];
  }
  function labelFor(list, key) {
    for (var i = 0; i < list.length; i++) if (list[i].key === key) return list[i].label;
    if (!key) return '—';
    return String(key).replace(/[_-]+/g, ' ').replace(/^./, function (c) { return c.toUpperCase(); });
  }

  /* ── Config ─────────────────────────────────────────────────────────────── */
  function cfg()    { return (global.CLEARSKY_CONFIG || {}); }
  function ops()    { return cfg().ops || {}; }
  function slaCfg() { return ops().sla || { critical:2, rush:8, standard:24 }; }

  /* ClearSky's own orgs are not customers. Without this the console lists
     itself as a client of itself the first time staff file a test intake. */
  function internalOrgs() {
    var list = ops().internalOrgs || ['clearsky-usa.com', 'csebuilders.com'];
    var out = {};
    for (var i = 0; i < list.length; i++) out[String(list[i]).toLowerCase()] = true;
    return out;
  }
  function isInternalOrg(orgId) { return !!internalOrgs()[String(orgId || '').toLowerCase()]; }

  /* ── Tolerant field access ───────────────────────────────────────────────
     pick(doc, ['a.b','c']) walks each dotted path, returns the first
     non-empty value. A guess that misses falls through; if all miss, the
     drawer shows the raw document so the real name is visible. */
  function dig(obj, path) {
    var parts = String(path).split('.'), cur = obj;
    for (var i = 0; i < parts.length; i++) {
      if (cur == null || typeof cur !== 'object') return undefined;
      cur = cur[parts[i]];
    }
    return cur;
  }
  function empty(v) { return v == null || v === '' || (Array.isArray(v) && !v.length); }
  function pick(doc, paths, dflt) {
    for (var i = 0; i < paths.length; i++) {
      var v = dig(doc, paths[i]);
      if (!empty(v)) return v;
    }
    return dflt;
  }

  /* WHAT THEY ASKED FOR is deliverables[] filtered on requested:true.

     NOT `scope`. `scope` is the site description — a map of
     {l2:{enabled:false}, bess:{enabled:true}, ...} — and reading it as a
     truthy map would mark EVERY deliverable requested, because {enabled:false}
     is itself a truthy object. That bug would have shown seven packages
     requested on an intake that asked for one. */
  function pickDeliverables(d) {
    var list = d && d.deliverables;
    if (Array.isArray(list)) {
      var out = [];
      for (var i = 0; i < list.length; i++) {
        var x = list[i];
        if (x && x.requested) out.push(x.key || '');
      }
      return out.filter(Boolean);
    }
    /* Older or hand-written records may carry a plain array. */
    if (Array.isArray(d && d.scope)) return d.scope.filter(function (s) { return typeof s === 'string'; });
    return [];
  }

  /* Delivery progress: deliverables carry their own status, so a half-built
     package set is visible without opening the editor. */
  function deliverableProgress(d) {
    var list = (d && d.deliverables) || [];
    var want = 0, done = 0;
    for (var i = 0; i < list.length; i++) {
      if (!list[i] || !list[i].requested) continue;
      want++;
      if (list[i].status === 'delivered' || list[i].status === 'complete' || list[i].outputUrl) done++;
    }
    return { requested: want, done: done };
  }

  /* The site scopes actually switched on, with whatever numbers were filled
     in. Rendered generically so a new scope added upstream still appears. */
  function enabledScopes(d) {
    var sc = (d && d.scope) || {}, out = [];
    for (var k in sc) {
      if (!sc.hasOwnProperty(k)) continue;
      var s = sc[k];
      if (!s || s.enabled !== true) continue;
      var bits = [];
      for (var f in s) {
        if (!s.hasOwnProperty(f) || f === 'enabled' || f === 'notes') continue;
        var v = s[f];
        if (v === '' || v == null || v === false) continue;
        bits.push((v === true ? f : f + ' ' + v));
      }
      out.push({ key:k, label:labelFor(TYPES, k), detail:bits.join(' · ') });
    }
    return out;
  }

  /* ── Time ───────────────────────────────────────────────────────────────── */
  function ms(v) {
    if (!v) return 0;
    if (typeof v === 'number') return v;
    if (typeof v === 'string') { var p = Date.parse(v); return isNaN(p) ? 0 : p; }
    if (v.toDate) { try { return v.toDate().getTime(); } catch (e) { return 0; } }
    if (v instanceof Date) return v.getTime();
    if (v.seconds) return v.seconds * 1000;
    return 0;
  }
  function fmtDate(v) {
    var t = ms(v);
    if (!t) return '—';
    var m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    var d = new Date(t);
    return m[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
  }
  function fmtDateTime(v) {
    var t = ms(v);
    if (!t) return '—';
    return fmtDate(t) + ' · ' + new Date(t).toLocaleTimeString([], { hour:'numeric', minute:'2-digit' });
  }

  /* Round FIRST, then pick the unit — otherwise 59.98 minutes prints as
     "60m" and 23.99 hours as "24h", both of which make the reader convert. */
  function fmtDur(msVal) {
    if (msVal == null || isNaN(msVal)) return '—';
    var neg = msVal < 0, v = Math.abs(msVal), out;
    if (v < 60000) {
      out = Math.max(1, Math.round(v / 1000)) + 's';
      if (out === '60s') out = '1m';
    } else if (v < HOUR) {
      var mins = Math.round(v / 60000);
      out = (mins >= 60) ? '1h' : mins + 'm';
    } else if (v < DAY) {
      var h = Math.floor(v / HOUR), m = Math.round((v % HOUR) / 60000);
      if (m === 60) { h += 1; m = 0; }
      out = (h >= 24) ? '1d' : (h + 'h' + (m ? ' ' + m + 'm' : ''));
    } else {
      var d = Math.floor(v / DAY), hh = Math.round((v % DAY) / HOUR);
      if (hh === 24) { d += 1; hh = 0; }
      out = d + 'd' + (hh ? ' ' + hh + 'h' : '');
    }
    return neg ? '−' + out : out;
  }
  function fmtAgo(v) {
    var t = ms(v);
    if (!t) return '—';
    var diff = Date.now() - t;
    if (diff < 45000) return 'just now';
    return (diff >= 0) ? fmtDur(diff) + ' ago' : 'in ' + fmtDur(-diff);
  }
  function fmtMoney(n, opts) {
    var v = Number(n) || 0, compact = opts && opts.compact;
    try {
      return v.toLocaleString('en-US', {
        style:'currency', currency: ops().currency || 'USD',
        maximumFractionDigits: (compact && Math.abs(v) >= 1000) ? 0 : (v % 1 ? 2 : 0),
        notation: (compact && Math.abs(v) >= 100000) ? 'compact' : 'standard'
      });
    } catch (e) { return '$' + Math.round(v).toLocaleString(); }
  }

  /* ── Response time ───────────────────────────────────────────────────────
     intake_projects has no first-response field of its own — it tracks status
     transitions, not when a human replied. The console writes
     `firstResponseAt` itself the first time staff act on a record.

     TWO CONSEQUENCES, both worth knowing before reading the dashboard:

       • Records submitted before this shipped have no stamp and show "—"
         forever. The metric starts now; it is not retroactive.
       • A record already past 'submitted' with no stamp counts as ANSWERED
         (we clearly replied — we priced it) but its response time is
         UNKNOWN, not zero. Counting it as zero would flatter the average
         with work nobody measured.                                           */
  function targetMs(req) {
    var hours = slaCfg()[req.priority] || slaCfg().standard || 24;
    return hours * HOUR;
  }
  function responseMs(req) {
    var s = ms(req.submittedAt), f = ms(req.firstResponseAt);
    if (!s || !f) return null;
    return Math.max(0, f - s);
  }
  function answered(req) {
    if (ms(req.firstResponseAt)) return true;
    return req.status && req.status !== 'submitted' && !statusOf(req.status).pre;
  }
  function clock(req, now) {
    now = now || Date.now();
    var t = targetMs(req), sub = ms(req.submittedAt), done = responseMs(req);
    var elapsed = (done != null) ? done : (sub ? Math.max(0, now - sub) : 0);
    var frac = t ? (elapsed / t) : 0;
    var warn = (ops().warnAt != null) ? ops().warnAt : 0.6;
    var state = frac >= 1 ? 'breach' : frac >= warn ? 'warn' : 'ok';
    return {
      target:t, elapsed:elapsed, remaining:t - elapsed, frac:frac,
      pct: Math.min(100, Math.round(frac * 100)),
      state:state, settled: done != null, answered: answered(req),
      unmeasured: answered(req) && done == null
    };
  }

  /* ── Money ───────────────────────────────────────────────────────────────
     The fee lives in the `quote` map, written by an administrator. The rep's
     cut isn't in intake_projects at all, so it comes from config unless the
     record carries an explicit override.

     Commission is earned at `delivered`, this pipeline's terminal state. If
     you later add a client sign-off step, point ops.payableStatus at it and
     nothing else here changes.                                               */
  function value(req) {
    var q = (req._raw && req._raw.quote) || {};
    var v = q.total;
    if (v == null || v === '') v = q.subtotal;
    return Number(v) || 0;
  }
  function rate(req) {
    var r = req.commissionRate;
    if (r == null || isNaN(r)) r = ops().defaultCommissionRate;
    if (r == null || isNaN(r)) r = 0.05;
    return Number(r);
  }
  function payableStatus() { return ops().payableStatus || 'delivered'; }
  function payout(req) { return value(req) * rate(req); }
  function isEarned(req) { return req.status === payableStatus(); }
  function isPaid(req)   { return isEarned(req) && !!ms(req.paidAt); }

  function dueMs(req) {
    if (req.dueDate) { var p = Date.parse(String(req.dueDate) + 'T23:59:59'); if (!isNaN(p)) return p; }
    var base = ms(req.firstResponseAt) || ms(req.submittedAt);
    if (!base) return 0;
    var d = (ops().deliveryDays || {})[req.priority];
    if (d == null) d = (ops().deliveryDays || {}).standard || 14;
    return base + d * DAY;
  }
  function cycleMs(req) {
    var a = ms(req.firstResponseAt) || ms(req.submittedAt);
    var d = ms(req.deliveredAt);
    if (!a || !d) return null;
    return Math.max(0, d - a);
  }

  /* ── Normalisation ──────────────────────────────────────────────────────
     Every candidate list below is a GUESS at omega-intake.js's shape. `_raw`
     keeps the original document so the drawer can show whatever didn't map. */
  function normalize(id, d) {
    d = d || {};
    var cust = d.customer || {}, proj = d.project || {}, adm = d.admin || {};
    var purpose = d.purpose || (d.routing === 'omega' ? 'service' : 'build');
    var prog = deliverableProgress(d);

    /* Site address: project.street/city/state, falling back to the customer's
       billing address only if the project has none — a job filed against a
       head-office address is still better than a blank. */
    var siteBits = [proj.street, proj.city, proj.state, proj.zip].filter(Boolean);
    if (!siteBits.length) siteBits = [cust.city, cust.state].filter(Boolean);

    return {
      id:            id,
      intakeId:      d.intakeId || id,
      orgId:         String(d.orgId || '').toLowerCase(),
      tenantName:    d.tenantName || '',
      purpose:       purpose,
      billable:      purpose === 'service',

      clientName:    cust.company || d.tenantName || '',
      contactName:   cust.contactName || (d.createdBy && d.createdBy.name) || '',
      contactEmail:  cust.email || (d.createdBy && d.createdBy.email) || '',
      contactPhone:  cust.phone || '',
      contactRole:   cust.role || '',
      customerNotes: cust.notes || '',

      /* project.name is what the client titled it; siteName is the site. The
         intake list shows the company when neither is set, so match that
         rather than inventing "Untitled". */
      projectName:   proj.name || proj.siteName || cust.company || 'Untitled intake',
      siteName:      proj.siteName || '',
      address:       siteBits.join(', '),
      utility:       proj.utility || '',
      ahj:           proj.ahj || '',
      projectStage:  proj.stage || '',
      projectNotes:  proj.notes || '',

      /* An intake can carry several site scopes at once. */
      scopes:        enabledScopes(d),
      projectType:   (enabledScopes(d)[0] || {}).key || '',

      /* Deliverables requested, plus how many are done. */
      scope:         pickDeliverables(d),
      progress:      prog,
      /* Full rows for the requested packages, so the drawer can attach the
         output links that are the actual delivery. */
      deliverables:  (Array.isArray(d.deliverables) ? d.deliverables : [])
                       .filter(function (x) { return x && x.requested; }),

      notes:         proj.notes || cust.notes || '',
      priority:      priorityKey(adm.priority),
      dueDate:       adm.dueDate || proj.targetDate || '',
      commissionRate: d.commissionRate,

      status:        d.status || 'draft',
      assignedTo:    String(adm.assignee || '').toLowerCase(),
      assignedName:  adm.assigneeName || '',
      /* omega-intake.js calls it editorProjectId, not projectId. */
      projectId:     d.editorProjectId || '',
      projectLabel:  d.editorProjectName || '',
      internalNotes: adm.internalNotes || '',

      submittedAt:     d.submittedAt || null,
      /* Written by this console. Absent on every record that predates it. */
      firstResponseAt: d.firstResponseAt || null,
      startedAt:       d.startedAt || null,
      /* omega-intake.js stamps completedAt when status hits 'delivered'.
         That's the delivery timestamp — no separate deliveredAt exists. */
      deliveredAt:     d.completedAt || null,
      /* Commission paid to the REP. Deliberately not `paidAt`: quote.paidAt
         already means the CLIENT paid their invoice, and conflating the two
         would have the earnings ledger call a job paid out the moment the
         customer settled. */
      paidAt:          d.commissionPaidAt || null,
      clientPaidAt:    (d.quote && d.quote.paidAt) || null,
      paymentStatus:   (d.quote && d.quote.paymentStatus) || '',

      /* {ts, type, message, actor}, newest first (unshift upstream). */
      activity:      Array.isArray(d.activity) ? d.activity.slice() : [],
      messages:      Array.isArray(d.messages) ? d.messages.slice() : [],
      files:         Array.isArray(d.files) ? d.files.slice() : [],
      links:         Array.isArray(d.links) ? d.links : [],
      /* Quote detail the client sees. */
      quoteNote:     (d.quote && d.quote.note) || '',
      quoteSentAt:   (d.quote && d.quote.sentAt) || null,
      quoteCurrency: (d.quote && d.quote.currency) || 'USD',
      paymentUrl:    (d.quote && d.quote.paymentUrl) || '',
      acceptance:    d.acceptance || null,
      /* The client's own claim that they paid. Separate from
         quote.paymentStatus, which only staff set. */
      paymentClaimedAt: (d.payment && d.payment.claimedAt) || null,
      paymentRef:       (d.payment && d.payment.reference) || '',
      _raw:          d,
      _demo:         !!d._demo
    };
  }

  /* ── Firestore ──────────────────────────────────────────────────────────── */
  var _db = null, _me = { email:'', name:'' }, _orgs = [];

  function init(db, me) {
    _db = db || null;
    if (me) _me = { email:(me.email || '').toLowerCase(), name: me.name || '' };
  }
  /* ── ISO strings, NOT serverTimestamp ────────────────────────────────────
     Every other tool writing intake_projects — omega-intake.js, intake.html,
     intake-admin.html — stores dates as ISO strings and reads them back with
     `new Date(str)`. A Firestore Timestamp survives a round trip through this
     console fine, but `new Date(Timestamp)` on the tenant side yields
     "Invalid Date".

     That is exactly what happened: this console stamped updatedAt as a server
     Timestamp and the client's project list started printing Invalid Date.

     Server time would be marginally more trustworthy for an SLA clock, but not
     at the cost of corrupting a document model three other pages read. If
     clock skew ever matters, move all four tools together. */
  function stamp() { return new Date().toISOString(); }

  /* ...but /projects is the OPPOSITE convention. index.html and projects.html
     write and read Firestore Timestamps there (`p.updatedAt?.toDate?.()`), so
     an ISO string in that collection renders the date column as a dash.

     Two collections, two conventions, and they are not interchangeable.
     Unifying them means rewriting every existing document in one of them;
     until someone does that migration, write what each collection expects. */
  function serverStamp() {
    try { return firebase.firestore.FieldValue.serverTimestamp(); }
    catch (e) { return new Date(); }
  }
  function collectionName() { return ops().collection || 'intake_projects'; }

  function loadRequests() {
    if (!_db) return Promise.reject(new Error('No database connection.'));
    return _db.collection(collectionName()).get().then(function (snap) {
      var out = [];
      snap.forEach(function (doc) { out.push(normalize(doc.id, doc.data())); });
      out.sort(function (a, b) { return ms(b.submittedAt) - ms(a.submittedAt); });
      return out;
    });
  }

  /* The tenant registry that already exists. Optional: if it's empty or
     unreadable, discovery falls back to orgIds seen on records, so the
     console degrades to "whoever has actually submitted" rather than to
     nothing. */
  function loadOrgs() {
    if (!_db) return Promise.resolve([]);
    return _db.collection('omega_orgs').get().then(function (snap) {
      var out = [];
      snap.forEach(function (doc) {
        var d = doc.data() || {};
        out.push({
          orgId:  String(d.orgId || doc.id).toLowerCase(),
          name:   d.name || d.clientName || d.displayName || '',
          active: d.active !== false,
          /* The registry doc id isn't always the orgId, and access writes
             have to land on the row that already exists rather than creating
             a second one beside it. */
          docId:  doc.id,
          /* Distinct from active:false — see setOrgAccess(). */
          suspended:       d.suspended === true,
          suspendedAt:     d.suspendedAt || null,
          suspendedBy:     d.suspendedBy || '',
          suspendedReason: d.suspendedReason || '',
          tier:            d.tier || d.accountTier || '',
          createdAt:       d.createdAt || null
        });
      });
      _orgs = out;
      return out;
    })['catch'](function (err) {
      console.warn('[ops] omega_orgs unreadable — falling back to record discovery:', err.message);
      _orgs = [];
      return [];
    });
  }
  function orgs() { return _orgs.slice(); }

  /* Display name, best available: registry → config override → the record's
     own clientName → title-cased domain. A tenant onboarded five minutes ago
     still reads as something a human recognises. */
  function tenantName(orgId, requests) {
    if (!orgId) return 'Unknown';
    var key = String(orgId).toLowerCase(), i;
    for (i = 0; i < _orgs.length; i++) if (_orgs[i].orgId === key && _orgs[i].name) return _orgs[i].name;
    var over = ops().tenantNames || {};
    if (over[key]) return over[key];
    if (requests) {
      for (i = 0; i < requests.length; i++) {
        if (requests[i].orgId === key && requests[i].clientName) return requests[i].clientName;
      }
    }
    var stem = key.replace(/\.[a-z.]+$/i, '');
    return stem.split(/[-_.]/).map(function (p) {
      return p ? p.charAt(0).toUpperCase() + p.slice(1) : '';
    }).join(' ') || key;
  }

  /* omega-intake.js writes activity as {ts, type, message, actor}. Match it
     exactly — a second shape in the same array means intake-admin.html renders
     half the log as blanks. */
  function entry(type, text) {
    return { ts: new Date().toISOString(), type: type, message: text || '',
             actor: _me.name || _me.email || 'system' };
  }

  function patch(id, fields, note) {
    if (!_db) return Promise.reject(new Error('No database connection.'));
    var body = {};
    for (var k in fields) if (fields.hasOwnProperty(k)) body[k] = fields[k];
    body.updatedAt = stamp();
    if (note) {
      try { body.activity = firebase.firestore.FieldValue.arrayUnion(entry(note.type, note.text)); }
      catch (e) { /* arrayUnion unavailable — skip the log rather than fail the write */ }
    }
    return _db.collection(collectionName()).doc(id).update(body);
  }

  /* Create the editor project for an intake and link the two. Stamped with
     the CLIENT's orgId so the finished work lands in their own portal.

     Field-for-field with omega-intake.js projectSeed(), PLUS the four canvas
     arrays index.html seeds on a hand-made project. Two paths create projects
     in this collection - a client opening their own from the intake, and this
     one - and a project that arrives missing half its context is obviously
     second-class the moment it opens in the editor.

     Timestamps here are server Timestamps, not ISO. See serverStamp(). */
  function createLinkedProject(req) {
    if (!_db) return Promise.reject(new Error('No database connection.'));
    var user = null;
    try { user = firebase.auth().currentUser; } catch (e) {}
    var raw = req._raw || {}, p = raw.project || {};
    var t = String(req.projectType || '').toLowerCase();
    return _db.collection('projects').add({
      orgId:      req.orgId,                       // the CLIENT's tenant
      uid:        user ? user.uid : null,
      name:       req.projectName || 'Untitled project',
      address:    req.address || '',
      city:       p.city || '', state: p.state || '', zip: p.zip || '',
      lat:        (p.lat === '' || p.lat == null) ? null : Number(p.lat),
      lng:        (p.lng === '' || p.lng == null) ? null : Number(p.lng),
      apn:        p.apn || '',
      utility:    p.utility || '',
      ahj:        p.ahj || '',
      stage:      p.stage || 'candidate',
      scopes:     (req.scopes || []).map(function (s) { return s.key; }),
      type:       (t === 'l2' || t === 'dcfc') ? 'EV' : 'BESS',
      client:     req.clientName || '',
      source:     'intake',
      intakeId:   req.intakeId || req.id,
      /* Owner is the STAFF member building it. The client still sees it
         because projects.html scopes on orgId, not owner. */
      ownerEmail: (_me.email || '').toLowerCase(),
      ownerName:  _me.name || _me.email || '',
      createdBy:  (_me.email || '').toLowerCase(),
      createdAt:  serverStamp(),
      updatedAt:  serverStamp(),
      elements: [], conduits: [], bessList: [], annotations: []
    });
  }


  /* ── Quoting ─────────────────────────────────────────────────────────────
     Standard rungs plus a custom amount. Fixed rungs mean two reps quoting the
     same job land on the same number, and the client sees a price list rather
     than a figure invented on a call. Anything off the ladder is still
     allowed — some jobs genuinely are bespoke — but it has to be typed
     deliberately rather than defaulted into. */
  var QUOTE_TIERS = [100, 250, 500, 750, 1000];

  /* Build the quote in the shape omega-intake.js's own sendQuote() produces,
     so intake-admin.html and the tenant portal read it with no special case.

     A flat fee still needs a LINE, because the client-facing quote renders
     lines — a total with no lines shows as a price for nothing. */
  function quotePayload(req, amount, note) {
    var wanted = (req.scope || []);
    var label = wanted.length === 1
      ? labelFor(SCOPE, wanted[0])
      : (wanted.length ? wanted.length + ' deliverables' : 'Project package');
    return {
      'quote.lines':    [{ key:'package', label:label, amount:Number(amount) || 0, note:note || '' }],
      'quote.subtotal': Number(amount) || 0,
      'quote.discount': 0,
      'quote.total':    Number(amount) || 0,
      'quote.currency': ops().currency || 'USD',
      'quote.sentAt':   stamp(),
      'quote.sentBy':   _me.email || '',
      'quote.note':     note || '',
      /* A re-quote must clear the previous answer, or a record can read as
         "accepted" against a number the client never saw. */
      acceptance:       { state:'', by:'', at:null, poNumber:'', note:'' },
      status:           'quoted'
    };
  }

  /* -- Files ---------------------------------------------------------------
     Real uploads, not just pasted links. The editor exports a proposal, a
     one-line, a plot plan, a cost estimate; those are files, and asking a rep
     to first park them on a Drive and paste the URL is a step that gets
     skipped, which is how a client ends up with "Delivered" and nothing to
     open.

     Firestore holds only the metadata. The bytes live in Cloud Storage under

         intake/{orgId}/{intakeId}/{fileId}-{name}

     ORG IS IN THE PATH ON PURPOSE. Storage rules cannot read Firestore, so
     they cannot look up who owns an intake — the only thing they can scope on
     is the path itself. Putting orgId there is what lets a client read their
     own files and nobody else's. See storage.rules.

     Links still work and are still supported. Some deliverables genuinely are
     a shared folder rather than a file.                                       */
  var MAX_FILE_MB = 50;

  function storage() {
    try { return firebase.storage(); }
    catch (e) { return null; }
  }

  function filePath(req, fileId, name) {
    var clean = String(name || 'file').replace(/[^\w.\- ]+/g, '_').slice(0, 120);
    return 'intake/' + (req.orgId || 'unknown') + '/' + (req.intakeId || req.id)
         + '/' + fileId + '-' + clean;
  }

  /* Upload one file and return the metadata row to append. Progress is
     reported so a 30 MB permit set doesn't look like a hung button. */
  function uploadFile(req, file, key, onProgress) {
    /* Validate the FILE before checking the connection. A 60 MB .mov should
       be told it's a 60 MB .mov, not "storage not loaded" — the second
       message sends the rep to look at the wrong thing entirely. */
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      return Promise.reject(new Error(file.name + ' is ' + Math.round(file.size / 1048576)
        + ' MB. The cap is ' + MAX_FILE_MB + ' MB \u2014 put anything larger on a shared '
        + 'drive and paste the link instead.'));
    }
    /* Mirror okDeliverable() in storage.rules. Not a control — the rules are
       — but a rejected upload otherwise surfaces as an opaque
       "storage/unauthorized", which reads as a broken button rather than an
       unsupported file. Browsers report unknown types (DWG, DXF) as '', which
       we send as application/octet-stream and the rules allow. */
    var ct = file.type || 'application/octet-stream';
    var okType = /^application\/pdf$/.test(ct) || /^image\//.test(ct)
              || /^application\/vnd/.test(ct)  || /^text\//.test(ct)
              || /^application\/(zip|x-zip-compressed|octet-stream)$/.test(ct);
    if (!okType) {
      return Promise.reject(new Error(file.name + ' is a ' + ct + ', which storage refuses. '
        + 'PDF, images, Office files, text, zip and CAD exports go through \u2014 put anything '
        + 'else in a zip first.'));
    }

    var st = storage();
    if (!st) return Promise.reject(new Error('Storage SDK not loaded on this page.'));

    var id = 'f_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
    var path = filePath(req, id, file.name);
    var task = st.ref(path).put(file, {
      contentType: ct,
      customMetadata: { intakeId: String(req.intakeId || req.id), orgId: String(req.orgId || '') }
    });
    return new Promise(function (resolve, reject) {
      task.on('state_changed',
        function (s) { if (onProgress) onProgress(Math.round((s.bytesTransferred / s.totalBytes) * 100)); },
        reject,
        function () {
          resolve({
            id: id, key: key || 'other', path: path,
            name: file.name, size: file.size,
            contentType: file.type || '', at: stamp(),
            by: _me.email || '', byName: _me.name || _me.email || ''
          });
        });
    });
  }

  /* Storage download URLs are resolved at render time rather than stored.
     A stored getDownloadURL() token is a permanent public link to a
     customer's permit set — anyone it is forwarded to can read it forever,
     with no way to revoke short of rewriting the file. Resolving on demand
     keeps the storage rules in the loop on every read. */
  function fileUrl(f) {
    var st = storage();
    if (!st) return Promise.reject(new Error('Storage SDK not loaded.'));
    return st.ref(f.path).getDownloadURL();
  }

  function removeFile(req, fileId) {
    var st = storage();
    var list = ((req._raw || {}).files || []).filter(function (f) { return f.id !== fileId; });
    var gone = ((req._raw || {}).files || []).filter(function (f) { return f.id === fileId; })[0];
    var after = (st && gone)
      ? st.ref(gone.path)['delete']()['catch'](function (e) {
          /* The metadata row is what the UI reads, so a failed object delete
             must not block removing it — otherwise a stale row is unremovable. */
          console.warn('[ops] storage delete failed, removing the row anyway:', e.message);
        })
      : Promise.resolve();
    return after.then(function () { return { files: list }; });
  }

  function filesFor(req, key) {
    return (req.files || []).filter(function (f) { return (f.key || 'other') === key; });
  }

  function fmtBytes(n) {
    n = Number(n) || 0;
    if (n < 1024) return n + ' B';
    if (n < 1048576) return Math.round(n / 1024) + ' KB';
    return (n / 1048576).toFixed(n < 10485760 ? 1 : 0) + ' MB';
  }


  /* -- Deliverables ------------------------------------------------------
     THE actual handover. Each requested deliverable carries its own outputUrl,
     and the tenant portal renders those as "Your files". Marking a record
     delivered without filling any of them in hands the client a status change
     and nothing else - which is exactly what this console did until now.

     The whole array is rewritten rather than patched by index: Firestore has
     no way to update one element of an array by position. The client can also
     toggle `requested` from their own intake form, so this works from the
     freshly loaded record rather than a stale copy. */
  function deliverablesPayload(req, edits) {
    var list = ((req._raw || {}).deliverables || []).map(function (d) {
      var e = edits[d.key];
      if (!e) return d;
      var out = {};
      for (var k in d) if (d.hasOwnProperty(k)) out[k] = d[k];
      if (e.outputUrl != null) {
        var u = String(e.outputUrl).trim();
        if (u && !/^https?:\/\//i.test(u)) u = 'https://' + u;
        out.outputUrl = u;
      }
      if (e.note != null) out.note = e.note;
      out.status = out.outputUrl ? 'delivered'
                 : (out.status === 'delivered' ? 'in_progress' : (out.status || 'not_started'));
      out.updatedAt = stamp();
      return out;
    });
    return { deliverables: list };
  }

  /* ── Messages ────────────────────────────────────────────────────────────
     A thread on the record itself, deliberately not a subcollection: the
     client already has read+update on their own intake document, so a plain
     array needs no new rules and no second read. */
  function messagePayload(text, side) {
    return {
      id:     'm_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7),
      at:     stamp(),
      side:   side || 'staff',
      by:     _me.email || '',
      byName: _me.name || _me.email || '',
      text:   String(text || '').slice(0, 4000)
    };
  }

  /* ── Team ────────────────────────────────────────────────────────────────
     The roster lives in omega_staff/{uid}. It fills itself: every ClearSky
     person who signs into the console gets a doc on first sign-in (role
     'none' — the create rule forbids self-granted power), and from then on
     they exist in every Assign dropdown. Roles are then set by an admin on
     the Team page. Nobody is hand-typed into a list that goes stale.

     Note on enforcement: a @clearsky-usa.com / @csebuilders.com address is an
     administrator BY DOMAIN in the rules (isAdmin), regardless of the role
     field. The role here governs two real things today: whether an OUTSIDE
     email gets console powers at all (role admin/rep = isOmegaStaff), and how
     a person is labelled and offered in assignment. Tightening domain users
     down by role is a rules change to make deliberately, not a side effect
     of this page. */
  function loadStaff() {
    if (!_db) return Promise.resolve([]);
    return _db.collection('omega_staff').get().then(function (snap) {
      var out = [];
      snap.forEach(function (d) {
        var v = d.data() || {};
        out.push({
          uid:    d.id,
          email:  String(v.email || '').toLowerCase(),
          name:   v.name || v.email || d.id,
          role:   v.role || 'none',
          active: v.active !== false
        });
      });
      out.sort(function (a, b) { return (a.name || a.email).localeCompare(b.name || b.email); });
      return out;
    });
  }

  /* Create-if-missing, never overwrite: the create rule pins role to 'none'
     and the email to the token, so this can't grant anything — it only makes
     the person visible to admins and to the Assign dropdown. */
  function ensureSelfStaff(user) {
    if (!_db || !user || !user.uid) return Promise.resolve(null);
    var ref = _db.collection('omega_staff').doc(user.uid);
    return ref.get().then(function (snap) {
      if (snap.exists) return null;
      return ref.set({
        email:     String(user.email || '').toLowerCase(),
        name:      user.displayName || user.email || '',
        role:      'none',
        active:    true,
        createdAt: stamp()
      });
    })['catch'](function (e) {
      console.warn('[ops] staff self-registration skipped:', e && e.message);
      return null;
    });
  }

  /* Admin-only by rules; a rep calling this gets permission-denied, which the
     Team page reports rather than hiding. */
  function setStaffRole(uid, patch) {
    if (!_db) return Promise.reject(new Error('No database connection.'));
    var clean = {};
    if (patch.role != null)   clean.role   = String(patch.role);
    if (patch.active != null) clean.active = !!patch.active;
    if (patch.name)           clean.name   = String(patch.name);
    clean.updatedAt = stamp();
    return _db.collection('omega_staff').doc(uid).set(clean, { merge: true });
  }

  function assignableStaff(list) {
    return (list || []).filter(function (s) { return s.active && s.email; });
  }

  /* ── Roll-ups ────────────────────────────────────────────────────────────
     Drafts and declined quotes stay out of every average. A draft nobody
     sent is not a response time we missed. */
  function inQueue(r) {
    if (statusOf(r.status).pre) return false;
    if (r.status === 'declined') return false;
    if (ops().serviceOnly !== false && !r.billable) return false;
    return true;
  }
  /* Blocked on the client. Still in the queue and still counted, but parked
     on the board — chasing it is a different job from building it. */
  function isBlocked(r) { return r.status === 'changes_requested'; }

  function summarize(reqs, opts) {
    opts = opts || {};
    var now = Date.now();
    var monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0,0,0,0);
    var weekAgo = now - 7 * DAY;
    var pay = payableStatus();

    var s = {
      total:0, open:0, awaitingResponse:0, breached:0, reviewing:0, quoted:0,
      accepted:0, blocked:0, working:0, delivered:0, declined:0, drafts:0, selfServe:0,
      valueOpen:0, valueCompleted:0,
      earnedThisMonth:0, earnedPending:0, earnedPaid:0, earnedAll:0,
      completed:0, completedThisMonth:0,
      respAvg:null, respAvg7d:null, unmeasured:0,
      cycleAvg:null, slaHitRate:null, oldestUnanswered:null
    };
    var respAll = [], resp7 = [], cyc = [], slaOk = 0, slaCount = 0;

    for (var i = 0; i < reqs.length; i++) {
      var r = reqs[i];
      if (opts.mine && r.assignedTo !== opts.mine) continue;
      if (statusOf(r.status).pre) { s.drafts++; continue; }
      if (!r.billable) { s.selfServe++; continue; }
      if (r.status === 'declined') { s.declined++; continue; }

      s.total++;
      var isDone = (r.status === pay);
      if (!isDone) { s.open++; s.valueOpen += value(r); }

      if (r.status === 'submitted')         s.awaitingResponse++;
      if (r.status === 'in_review')         s.reviewing++;
      if (r.status === 'quoted')            s.quoted++;
      if (r.status === 'accepted')          s.accepted++;
      if (r.status === 'changes_requested') s.blocked++;
      if (r.status === 'in_production')     s.working++;
      if (r.status === 'delivered')         s.delivered++;

      var c = clock(r, now);
      if (c.state === 'breach' && !c.answered) s.breached++;
      if (c.unmeasured) s.unmeasured++;

      if (!c.answered && ms(r.submittedAt)) {
        if (!s.oldestUnanswered || ms(r.submittedAt) < ms(s.oldestUnanswered.submittedAt)) {
          s.oldestUnanswered = r;
        }
      }

      var rm = responseMs(r);
      if (rm != null) {
        respAll.push(rm);
        if (ms(r.firstResponseAt) >= weekAgo) resp7.push(rm);
        slaCount++;
        if (rm <= targetMs(r)) slaOk++;
      }
      var cm = cycleMs(r);
      if (cm != null) cyc.push(cm);

      if (isDone) {
        s.completed++;
        s.valueCompleted += value(r);
        var p = payout(r);
        s.earnedAll += p;
        if (isPaid(r)) s.earnedPaid += p; else s.earnedPending += p;
        var when = ms(r.deliveredAt) || ms(r.submittedAt);
        if (when >= monthStart.getTime()) { s.completedThisMonth++; s.earnedThisMonth += p; }
      }
    }

    function avg(a) {
      if (!a.length) return null;
      var t = 0; for (var i = 0; i < a.length; i++) t += a[i];
      return t / a.length;
    }
    s.respAvg = avg(respAll); s.respAvg7d = avg(resp7); s.cycleAvg = avg(cyc);
    s.slaHitRate = slaCount ? (slaOk / slaCount) : null;
    s.respCount = respAll.length;
    return s;
  }

  /* Every tenant the console knows about, from all three sources.

     INTERNAL ORGS ARE SHOWN, NOT HIDDEN. The first version silently dropped
     clearsky-usa.com / csebuilders.com records everywhere, which meant a
     submission from the demo portal (whose config points at ClearSky's own
     org) wrote to Firestore successfully and then appeared NOWHERE — the
     worst kind of missing, because nothing was actually lost. The rule now:
     every record that reaches intake_projects registers in this console.
     Internal rows are flagged so they read as what they are rather than as
     customers, and stay OUT of the revenue metrics (see summarize callers). */
  function byTenant(reqs) {
    var map = {}, i, r, key;

    function label(key, base) {
      return isInternalOrg(key) ? (base || tenantName(key)) + ' \u00b7 internal' : (base || tenantName(key));
    }

    for (i = 0; i < _orgs.length; i++) {
      key = _orgs[i].orgId;
      if (!key || _orgs[i].active === false) continue;
      map[key] = { orgId:key, name:label(key, _orgs[i].name), internal:isInternalOrg(key),
                   requests:[], source:'registry',
                   suspended:_orgs[i].suspended, tier:_orgs[i].tier };
    }
    var over = ops().tenantNames || {};
    for (key in over) {
      if (!over.hasOwnProperty(key)) continue;
      if (!map[key]) map[key] = { orgId:key, name:label(key, over[key]), internal:isInternalOrg(key),
                                  requests:[], source:'config' };
    }
    for (i = 0; i < reqs.length; i++) {
      r = reqs[i]; key = r.orgId;
      if (!key) continue;
      if (!map[key]) map[key] = { orgId:key, name:label(key), internal:isInternalOrg(key),
                                  requests:[], source:'observed' };
      map[key].requests.push(r);
    }

    var out = [];
    for (key in map) {
      if (!map.hasOwnProperty(key)) continue;
      var t = map[key];
      t.stats = summarize(t.requests);
      t.lastActivity = 0;
      for (i = 0; i < t.requests.length; i++) {
        var w = Math.max(ms(t.requests[i].submittedAt), ms(t.requests[i].deliveredAt));
        if (w > t.lastActivity) t.lastActivity = w;
      }
      out.push(t);
    }
    out.sort(function (a, b) {
      if (b.lastActivity !== a.lastActivity) return b.lastActivity - a.lastActivity;
      return String(a.name).localeCompare(String(b.name));
    });
    return out;
  }

  function byStaff(reqs) {
    var map = {};
    for (var i = 0; i < reqs.length; i++) {
      var r = reqs[i], who = r.assignedTo;
      if (!who) continue;
      if (!map[who]) map[who] = { email:who, name:r.assignedName || who.split('@')[0], requests:[] };
      map[who].requests.push(r);
    }
    var out = [];
    for (var k in map) {
      if (!map.hasOwnProperty(k)) continue;
      map[k].stats = summarize(map[k].requests);
      out.push(map[k]);
    }
    out.sort(function (a, b) { return b.stats.earnedAll - a.stats.earnedAll; });
    return out;
  }

  /* ═══════════════════════════════════════════════════════════════════════
     PROJECT SIZING
     ═══════════════════════════════════════════════════════════════════════
     The intake already collects the numbers — bess.powerMw, compute.itLoadMw,
     solar.dcKw and so on — but until now nothing read them. enabledScopes()
     stringifies whatever it finds ("powerMw 12.5") which is fine for a chip
     and useless for sorting, filtering or comparing against a threshold.

     So sizing reads the RAW scope map, not enabledScopes' output, and returns
     numbers. Field names go through the same candidate-list tolerance as
     everything else: the shape has been read off omega-intake.js' samples but
     not guaranteed, and a renamed field should degrade to "size not stated"
     rather than to a confident zero.                                        */
  var SIZE = {
    bess:    [ { key:'powerMw',    from:['powerMw','mw','powerMW','power'],           unit:'MW',    label:'Power',     toMw:1 },
               { key:'energyMwh',  from:['energyMwh','mwh','energyMWh','energy'],     unit:'MWh',   label:'Energy' },
               { key:'hours',      from:['hours','duration','durationH'],             unit:'h',     label:'Duration' } ],
    compute: [ { key:'itLoadMw',   from:['itLoadMw','loadMw','mw','itLoad','powerMw'],unit:'MW',    label:'IT load',   toMw:1 },
               { key:'racks',      from:['racks','rackCount'],                        unit:'racks', label:'Racks' } ],
    solar:   [ { key:'dcKw',       from:['dcKw','kwDc','dcKW'],                       unit:'kW',    label:'DC',        toMw:0.001 },
               { key:'acKw',       from:['acKw','kwAc','acKW'],                       unit:'kW',    label:'AC',        toMw:0.001 } ],
    der:     [ { key:'capacityKw', from:['capacityKw','kw','capacity','capacityKW'],  unit:'kW',    label:'Capacity',  toMw:0.001 } ],
    dcfc:    [ { key:'dispensers', from:['dispensers','stalls','chargers','ports'],   unit:'ports', label:'Dispensers' },
               { key:'kwPerPort',  from:['kwPerPort','portKw','kw'],                  unit:'kW',    label:'Per port' } ],
    l2:      [ { key:'ports',      from:['ports','chargers','stalls'],                unit:'ports', label:'Ports' },
               { key:'kwPerPort',  from:['kwPerPort','portKw','kw'],                  unit:'kW',    label:'Per port' } ]
  };

  /* '12.5', '12.5 MW' and 12.5 all mean the same thing on a form somebody
     typed into. '' and 0 do not: 0 is a stated zero and stays a number. */
  function num(v) {
    if (typeof v === 'number') return isFinite(v) ? v : null;
    if (typeof v !== 'string') return null;
    var m = v.replace(/,/g, '').match(/-?\d+(\.\d+)?/);
    return m ? parseFloat(m[0]) : null;
  }

  function fmtNum(n) {
    if (n == null) return '—';
    if (n >= 1000) return Math.round(n).toLocaleString('en-US');
    return String(Math.round(n * 100) / 100);
  }

  /* Every switched-on scope with its numbers resolved. `mw` is the scope
     normalised to megawatts where that's meaningful, which is what makes
     "biggest first" sortable across a BESS, a solar farm and a data centre.
     Charging sites derive it from ports x kW/port when both are there. */
  function scopeSizes(req) {
    /* Editor projects carry no `scope` map — their sizing is spread through
       the document the site was drawn in. Same return shape either way, so
       every screening caller works on both without knowing the difference. */
    if (req && req.source === 'editor') return deepSizes(req._raw || {});
    var raw = (req && req._raw && req._raw.scope) || {}, out = [];
    for (var k in raw) {
      if (!raw.hasOwnProperty(k)) continue;
      var s = raw[k];
      if (!s || s.enabled !== true) continue;

      var rules = SIZE[k] || [], metrics = [], mw = null, byKey = {};
      for (var i = 0; i < rules.length; i++) {
        var r = rules[i], v = null;
        for (var j = 0; j < r.from.length && v == null; j++) v = num(s[r.from[j]]);
        if (v == null) continue;
        byKey[r.key] = v;
        metrics.push({ key:r.key, label:r.label, value:v, unit:r.unit,
                       text: fmtNum(v) + ' ' + r.unit });
        if (r.toMw && mw == null) mw = v * r.toMw;
      }
      if (mw == null && byKey.ports != null && byKey.kwPerPort != null)      mw = byKey.ports * byKey.kwPerPort / 1000;
      if (mw == null && byKey.dispensers != null && byKey.kwPerPort != null) mw = byKey.dispensers * byKey.kwPerPort / 1000;

      out.push({ key:k, label:labelFor(TYPES, k), short:shortFor(k),
                 metrics:metrics, values:byKey, mw:mw, sized:metrics.length > 0,
                 text: metrics.length ? metrics.map(function (m) { return m.text; }).join(' · ')
                                      : 'size not stated',
                 useCase: s.useCase || s.notes || '' });
    }
    out.sort(function (a, b) { return (b.mw || 0) - (a.mw || 0); });
    return out;
  }

  function shortFor(key) {
    for (var i = 0; i < TYPES.length; i++) if (TYPES[i].key === key) return TYPES[i].short;
    return String(key || '?').toUpperCase();
  }

  /* Biggest scope on the record, in MW. Null when nothing is sized — which
     sorts differently from zero and must, or every blank intake would sit at
     the bottom of the list looking like a tiny project instead of an
     unmeasured one. */
  function sizeMw(req) {
    var sc = scopeSizes(req), best = null;
    for (var i = 0; i < sc.length; i++) if (sc[i].mw != null && (best == null || sc[i].mw > best)) best = sc[i].mw;
    return best;
  }

  function sizeText(req) {
    var sc = scopeSizes(req);
    if (!sc.length) return '—';
    return sc.map(function (s) { return s.short + ' ' + s.text; }).join(' · ');
  }

  /* ═══════════════════════════════════════════════════════════════════════
     FINANCE-MARKETPLACE QUALIFICATION
     ═══════════════════════════════════════════════════════════════════════
     Thresholds live in ops.finance.qualify in config.js — deliberately, so
     the bar moves by editing one file rather than by editing this one. A
     scope qualifies if ANY of its metrics clears its own threshold: a 4 MW /
     20 MWh battery is still a real financing candidate on duration even
     though it misses on power, and requiring both would hide it.

     THREE OUTCOMES, NOT TWO. 'unsized' is the one that earns its keep: an
     intake with a scope switched on and no numbers in it is not a small
     project, it's an unanswered question, and it belongs on a list somebody
     works rather than in the same bucket as a genuinely small job. Folding it
     into 'below' would quietly bury the deals worth chasing.

     Deliberately NOT gated on quote.total. That's OUR fee for drawings, not
     the project's capital cost — a $12k fee can sit on a $90M data centre.
     Screening the marketplace on our own invoice would be backwards.        */
  function financeCfg() {
    var f = ops().finance || {};
    return {
      qualify: f.qualify || {},
      label:   f.label || 'Finance marketplace',
      note:    f.note || ''
    };
  }

  function qualify(req) {
    var rules = financeCfg().qualify;
    var sizes = scopeSizes(req);
    var hits = [], misses = [], unsized = [], ruled = 0;

    for (var i = 0; i < sizes.length; i++) {
      var sc = sizes[i], rule = rules[sc.key];
      if (!rule) continue;
      ruled++;
      var sawNumber = false, cleared = false;
      for (var m in rule) {
        if (!rule.hasOwnProperty(m)) continue;
        var want = num(rule[m]), got = sc.values[m];
        if (want == null) continue;
        if (got == null) continue;
        sawNumber = true;
        /* SIZE only describes the intake's own scopes, so an editor-only
           category (powergen, charging) has no rule to read a unit from and
           rendered as "Powergen 5 " with the unit missing. */
        var one = { type:sc.key, short:sc.short, metric:m, value:got, want:want,
                    unit:unitFor(sc.key, m) || metricUnit(m) };
        if (got >= want) { cleared = true; hits.push(one); } else misses.push(one);
      }
      if (!sawNumber) unsized.push({ type:sc.key, short:sc.short });
      if (cleared) sc.qualifying = true;
    }

    var state = !ruled          ? 'other'
              : hits.length     ? 'qualified'
              : unsized.length && !misses.length ? 'unsized'
              : misses.length   ? 'below'
              : 'unsized';

    return {
      state:   state,
      hits:    hits,
      misses:  misses,
      unsized: unsized,
      sizes:   sizes,
      mw:      sizeMw(req),
      /* One line a human can act on, not a status code. Grouped by scope so a
         battery clearing on both power and energy reads "BESS 12.5 MW · 50
         MWh" rather than repeating the prefix on every metric. */
      headline: state === 'qualified'
                  ? groupHits(hits, false)
                : state === 'unsized'
                  ? 'Sizing not captured on the intake'
                : state === 'below'
                  ? groupHits(misses, true)
                  : 'No screening rule for this scope'
    };
  }

  /* "BESS 12.5 MW · 50 MWh", not "BESS 12.5 MW · BESS 50 MWh". withTarget
     appends the bar it missed by, which is the only number that makes a
     'below' row worth reading — 1.4 MW alone doesn't say how close it came. */
  function groupHits(list, withTarget) {
    var order = [], byType = {};
    for (var i = 0; i < list.length; i++) {
      var h = list[i];
      if (!byType[h.short]) { byType[h.short] = []; order.push(h.short); }
      byType[h.short].push(fmtNum(h.value) + (withTarget ? '/' + fmtNum(h.want) : '') + ' ' + h.unit);
    }
    return order.map(function (k) { return k + ' ' + byType[k].join(' · '); }).join(' · ');
  }

  function unitFor(type, metric) {
    var rules = SIZE[type] || [];
    for (var i = 0; i < rules.length; i++) if (rules[i].key === metric) return rules[i].unit;
    return '';
  }

  /* What a client is actually building, by scope, with the totals summed.
     Drafts and declined jobs are included on purpose here — unlike every
     delivery metric. A battery they sketched and never submitted is still a
     battery they're thinking about, and this table exists to find those. */
  function portfolio(reqs) {
    var map = {}, i, j;
    for (i = 0; i < reqs.length; i++) {
      var q = qualify(reqs[i]), sizes = q.sizes;
      for (j = 0; j < sizes.length; j++) {
        var sc = sizes[j], t = map[sc.key];
        if (!t) t = map[sc.key] = { key:sc.key, label:sc.label, short:sc.short,
                                    count:0, sized:0, qualified:0, mw:0, mwh:0, units:0 };
        t.count++;
        if (sc.sized) t.sized++;
        if (q.state === 'qualified' && sc.qualifying) t.qualified++;
        if (sc.mw != null) t.mw += sc.mw;
        if (sc.values.energyMwh != null) t.mwh += sc.values.energyMwh;
        if (sc.values.ports != null)      t.units += sc.values.ports;
        if (sc.values.dispensers != null) t.units += sc.values.dispensers;
      }
    }
    var out = [];
    for (var k in map) if (map.hasOwnProperty(k)) out.push(map[k]);
    out.sort(function (a, b) { return (b.mw - a.mw) || (b.count - a.count); });
    return out;
  }

  /* Screening list, biggest first. Unsized rows sort after qualified ones but
     before the ones that genuinely missed — they're work, not rejects. */
  function opportunities(reqs, opts) {
    opts = opts || {};
    var out = [], i;
    for (i = 0; i < reqs.length; i++) {
      var r = reqs[i], q = qualify(r);
      if (opts.state && q.state !== opts.state) continue;
      if (opts.orgId && r.orgId !== opts.orgId) continue;
      if (opts.excludeInternal && isInternalOrg(r.orgId)) continue;
      out.push({ req:r, q:q });
    }
    var rank = { qualified:0, unsized:1, below:2, other:3 };
    out.sort(function (a, b) {
      var ra = rank[a.q.state], rb = rank[b.q.state];
      if (ra !== rb) return ra - rb;
      return (b.q.mw || 0) - (a.q.mw || 0);
    });
    return out;
  }

  /* ═══════════════════════════════════════════════════════════════════════
     TENANT ACCOUNTS AND THEIR USERS
     ═══════════════════════════════════════════════════════════════════════
     Read this before trusting anything below.

     WHAT THE BROWSER CAN DO:
       · send a password-reset email to any address (Firebase client SDK)
       · read and write Firestore documents the rules allow

     WHAT THE BROWSER CANNOT DO, AT ALL:
       · set somebody's password
       · disable, delete or list Firebase Auth accounts
       · see when anyone last signed in

     Those need the Admin SDK on a server. There is no client-side trick and
     no rules change that unlocks them. So the access controls here write a
     FLAG to Firestore, and the flag does nothing on its own — the tenant
     portals' rules have to check it. suspendEnforced() reports whether that's
     been wired up, and the UI says so out loud rather than showing a switch
     that looks like it locked a door it didn't.

     Users are DISCOVERED, the same way tenants are:
       1. team_members/{orgId}__{email} — the profile the portal already writes
       2. contacts observed on that org's own intake records
     A person who has submitted an intake but never opened the portal exists
     in source 2 only, and is exactly the person you'd otherwise miss.       */

  /* ── The Admin-SDK bridge ────────────────────────────────────────────────
     Everything above about what a browser can't do stays true. What changes
     is that it can now ASK a server to do it — if one has been deployed.

     Detection is deliberately configuration, not probing. Calling a function
     that doesn't exist returns the same `not-found` a genuine bug returns,
     and treating that as "no server deployed" would silently swallow a real
     failure and fall back to writing an inert flag. So the deployer asserts
     it in config.js and the console believes them; the honest failure mode is
     a visible error, not a quiet downgrade. */
  function fnCfg() { return (ops().accessControl || {}).functions || {}; }
  function adminAvailable() { return fnCfg().enabled === true; }

  function callFn(name, payload) {
    if (!adminAvailable()) {
      return Promise.reject(new Error('Access-control functions are not enabled.'));
    }
    var fns;
    try {
      fns = firebase.app().functions(fnCfg().region || 'us-central1');
    } catch (e) {
      return Promise.reject(new Error(
        'The Firebase Functions SDK did not load, so the console cannot reach the '
        + 'access-control server. Check the firebase-functions-compat script tag.'));
    }
    return fns.httpsCallable(name)(payload || {}).then(function (res) {
      return (res && res.data) || {};
    });
  }

  /* Auth truth for a set of addresses: does the account exist, is it already
     disabled, how do they sign in, when did they last. Firestore knows none
     of this. Failure is non-fatal — the page still renders what Firestore
     knows, flagged as such, rather than showing nothing. */
  function lookupUsers(emails) {
    if (!adminAvailable() || !emails || !emails.length) return Promise.resolve(null);
    return callFn('omegaLookupUsers', { emails: emails })
      .then(function (r) {
        var map = {};
        (r.users || []).forEach(function (u) { map[String(u.email).toLowerCase()] = u; });
        return map;
      })['catch'](function (e) {
        console.warn('[ops] auth lookup unavailable:', e && e.message);
        return null;
      });
  }

  /* ═══════════════════════════════════════════════════════════════════════
     EDITOR PROJECTS
     ═══════════════════════════════════════════════════════════════════════
     Screening that reads only intake_projects misses most of the work. A
     client sizes a site in the editor long before — and often instead of —
     filing an intake that describes it, so the biggest thing a tenant is
     building is frequently a `projects` document nobody has screened.

     WHAT THIS DOES NOT KNOW. projects.html reads name/address/type/owner and
     nothing else; the sizing lives inside editor.html, which is not in this
     repo. Rather than invent field names — the exact mistake the field map at
     the top of this file exists to record — the extractor below RECOGNISES
     rather than addresses: it walks the document, matches numeric fields
     against known sizing vocabulary at any depth, and reports what it could
     not place. sizingReport() renders that on the Accounts page, so a field we
     are missing shows up as a named candidate to map instead of as a silent
     zero. Confirm the real names against editor.html and the guessing stops. */

  function normalizeProject(id, d) {
    d = d || {};
    return {
      id:        id,
      source:    'editor',
      orgId:     String(d.orgId || '').toLowerCase(),
      projectName: d.name || 'Untitled project',
      clientName:  d.clientName || '',
      address:   d.address || '',
      siteName:  d.siteName || '',
      editorType: d.type || '',
      ownerEmail: String(d.ownerEmail || d.createdBy || '').toLowerCase(),
      ownerName:  d.ownerName || '',
      intakeId:   d.intakeId || '',
      status:     'editor',
      billable:   false,
      submittedAt: d.createdAt || null,
      updatedAt:   d.updatedAt || null,
      scopes:     [],
      _raw:       d,
      _demo:      !!d._demo
    };
  }

  function loadProjects() {
    if (!_db) return Promise.resolve([]);
    return _db.collection('projects').get().then(function (snap) {
      var out = [];
      snap.forEach(function (doc) { out.push(normalizeProject(doc.id, doc.data())); });
      return out;
    })['catch'](function (err) {
      /* Non-fatal by design: the intake queue is the console's job and must
         not go dark because the editor collection is unreadable. */
      console.warn('[ops] projects unreadable — screening will cover intakes only:', err && err.message);
      return [];
    });
  }

  /* ── The sizing vocabulary ───────────────────────────────────────────────
     Keys are compared with punctuation and case stripped, so power_mw,
     powerMW and "Power (MW)" all land on the same rule. Order matters: the
     longest, most specific patterns are tested first, because `mw` would
     otherwise swallow `itLoadMw`. */
  var METRIC_KEYS = [
    /* CONFIRMED, not guessed. The /equipment block in the deployed
       firestore.rules documents the registry's own body: key, cat, sub,
       manufacturer, model, energyKwh, powerKw, efficiency, pnomKva, pmaxKw,
       cRate, lengthMm/widthMm/heightMm. Those are the editor's vocabulary,
       so they go first and exactly. */
    { re:/^energykwh$/,                                                  metric:'energyMwh',unit:'MWh',             cat:'bess', scale:0.001 },
    { re:/^powerkw$/,                                                    metric:'powerMw',  unit:'MW',  toMw:1,     scale:0.001 },
    { re:/^pmaxkw$/,                                                     metric:'powerMw',  unit:'MW',  toMw:1,     scale:0.001 },
    /* kVA is apparent power. Treated as real power only because an
       inverter's kVA and kW are close enough for a screening threshold —
       never for engineering. */
    { re:/^pnomkva$/,                                                    metric:'powerMw',  unit:'MW',  toMw:1,     scale:0.001 },
    { re:/^(itload|itcapacity|computeload|critload|criticalload)(mw)?$/, metric:'itLoadMw', unit:'MW',  toMw:1,     cat:'compute' },
    { re:/^(itload|itcapacity|computeload|critload|criticalload)kw$/,    metric:'itLoadMw', unit:'MW',  toMw:1,     cat:'compute', scale:0.001 },
    /* Prefixes stack in the wild: solarDcKw, pvDcKwp, solarCapacityKw. One
       optional token was not enough — solarDcKw fell through to unmapped. */
    { re:/^(dc|pv|solar)+(capacity|rated|nameplate)?kw(p|dc|ac)?$/,      metric:'dcKw',     unit:'kW',  toMw:0.001, cat:'solar' },
    { re:/^kw(p|dc)$/,                                                   metric:'dcKw',     unit:'kW',  toMw:0.001, cat:'solar' },
    { re:/^(dc|pv|solar)+(capacity|rated|nameplate)?mw(p|dc|ac)?$/,      metric:'dcKw',     unit:'kW',  toMw:0.001, cat:'solar', scale:1000 },
    { re:/^(energy|storage|battery)(capacity)?mwh$/,                     metric:'energyMwh',unit:'MWh',             cat:'bess' },
    { re:/^mwh$/,                                                        metric:'energyMwh',unit:'MWh',             cat:'bess' },
    { re:/^(energy|storage|battery)(capacity)?kwh$/,                     metric:'energyMwh',unit:'MWh',             cat:'bess', scale:0.001 },
    { re:/^kwh$/,                                                        metric:'energyMwh',unit:'MWh',             cat:'bess', scale:0.001 },
    { re:/^(genset|generator|gen|engine|turbine|prime|standby)(power)?(mw)?$/, metric:'powerMw', unit:'MW', toMw:1, cat:'powergen' },
    { re:/^(genset|generator|gen|engine|turbine|prime|standby)(power)?kw$/,    metric:'powerMw', unit:'MW', toMw:1, cat:'powergen', scale:0.001 },
    { re:/^(ports|stalls|dispensers|chargers|connectors)$/,              metric:'ports',    unit:'ports',           cat:'charging' },
    { re:/^(power|rated|ac|inverter|nameplate)?(capacity)?mw(ac)?$/,     metric:'powerMw',  unit:'MW',  toMw:1 },
    { re:/^(power|rated|ac|inverter|nameplate)?(capacity)?kw(ac)?$/,     metric:'powerMw',  unit:'MW',  toMw:1,     scale:0.001 },
    { re:/^(storage|battery|bess)?(duration)?(hours|hrs|h|duration)$/,   metric:'hours',    unit:'h',               cat:'bess' }
  ];

  /* Category from the surrounding context — the key an array hangs off, or a
     type/kind field on the object itself. An `mw` sitting inside
     `solarArrays[2]` is solar; the same key inside `gensets[0]` is not. */
  var CAT_HINTS = [
    { re:/(bess|batter|storage|ess\b)/,                     cat:'bess' },
    { re:/(solar|pv\b|photovolt|array|module|panel)/,       cat:'solar' },
    { re:/(compute|datacent|datacenter|\bit\b|rack|server)/,cat:'compute' },
    { re:/(genset|generator|turbine|engine|gener|powergen)/,cat:'powergen' },
    { re:/(dcfc|fastchar|level2|\bl2\b|evse|charger|dispenser)/, cat:'charging' },
    { re:/(der\b|microgrid|distributed)/,                   cat:'der' }
  ];

  function normKey(k) { return String(k || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }

  function hintCat(text) {
    var t = String(text || '').toLowerCase();
    for (var i = 0; i < CAT_HINTS.length; i++) if (CAT_HINTS[i].re.test(t)) return CAT_HINTS[i].cat;
    return null;
  }

  /* Numeric-looking fields we could not place, so they can be named on the
     page rather than lost. Excludes the obvious non-sizing numerics — a
     screening panel listing `zoom` and `latitude` as candidate capacities
     trains people to ignore it. */
  var NOT_SIZING = /^(lat|lng|lon|latitude|longitude|zoom|rotation|angle|bearing|opacity|scale|width|height|x|y|z|left|top|right|bottom|index|order|version|schemaversion|zindex|radius|strokewidth|fontsize|page|count|id|lengthmm|widthmm|heightmm|efficiency|crate|voltage|volts|kv|hz|frequency|cost|price|usd|qty|quantity)$/;

  /* Walks the document, collecting sizing per category. Depth- and
     node-capped: an editor document can carry a large geometry tree and this
     runs on every render. */
  function deepSizes(doc, opts) {
    opts = opts || {};
    var byCat = {}, unknown = {}, unresolved = {}, nodes = 0;

    function bucket(cat) {
      if (!byCat[cat]) byCat[cat] = { key:cat, values:{}, paths:[] };
      return byCat[cat];
    }

    function walk(node, cat, path, depth) {
      if (node == null || depth > 6 || nodes > 4000) return;
      nodes++;

      if (Array.isArray(node)) {
        for (var i = 0; i < node.length && i < 400; i++) walk(node[i], cat, path, depth + 1);
        return;
      }
      if (typeof node !== 'object') return;

      /* A type/kind/category on the node itself beats whatever it inherited. */
      var own = hintCat(node.type || node.kind || node.category || node.class || node.subtype || '');
      var here = own || cat;

      /* An explicitly disabled block is not part of the site. */
      if (node.enabled === false || node.deleted === true || node.active === false) return;

      /* A placed piece of equipment. Its capacity is in the registry, not in
         the project document, so resolve it and count it against whatever
         category the catalog entry declares. */
      var placed = placedItem(node);
      if (placed) {
        var pc = hintCat(placed.entry.cat + ' ' + placed.entry.sub + ' ' + placed.entry.type
                         + ' ' + placed.entry.label) || here;
        if (pc) {
          var pb = bucket(pc);
          if (placed.entry.powerKw)   pb.values.powerMw   = (pb.values.powerMw   || 0) + placed.entry.powerKw  * placed.qty / 1000;
          if (placed.entry.energyKwh) pb.values.energyMwh = (pb.values.energyMwh || 0) + placed.entry.energyKwh * placed.qty / 1000;
          if (placed.entry.powerKw || placed.entry.energyKwh) {
            pb.paths.push((path ? path + '.' : '') + 'catalogKey ' + placed.key
                          + (placed.qty > 1 ? ' x' + placed.qty : '')
                          + ' \u2192 ' + placed.entry.label);
          }
        }
      } else {
        var miss = unresolvedKey(node);
        if (miss) unresolved[miss] = (unresolved[miss] || 0) + 1;
      }

      for (var k in node) {
        if (!node.hasOwnProperty(k)) continue;
        var v = node[k], nk = normKey(k);

        if (v && typeof v === 'object') {
          walk(v, hintCat(k) || here, path ? path + '.' + k : k, depth + 1);
          continue;
        }

        var n = num(v);
        if (n == null || n === 0) continue;

        var matched = null;
        for (var r = 0; r < METRIC_KEYS.length; r++) {
          if (METRIC_KEYS[r].re.test(nk)) { matched = METRIC_KEYS[r]; break; }
        }
        if (matched) {
          var cat2 = matched.cat || here;
          if (!cat2) continue;   /* an unattributable `mw` is not worth guessing */
          var b = bucket(cat2), val = n * (matched.scale == null ? 1 : matched.scale);
          b.values[matched.metric] = (b.values[matched.metric] || 0) + val;
          b.paths.push((path ? path + '.' : '') + k + ' = ' + fmtNum(n));
        } else if (!NOT_SIZING.test(nk) && typeof v === 'number') {
          var p = (path ? path + '.' : '') + k;
          unknown[p] = (unknown[p] || 0) + 1;
        }
      }
    }

    walk(doc, hintCat(doc && doc.type) || null, '', 0);

    var out = [];
    for (var c in byCat) {
      if (!byCat.hasOwnProperty(c)) continue;
      var b = byCat[c], mw = null;
      if (b.values.powerMw  != null) mw = b.values.powerMw;
      if (mw == null && b.values.itLoadMw != null) mw = b.values.itLoadMw;
      if (mw == null && b.values.dcKw     != null) mw = b.values.dcKw / 1000;
      var metrics = [];
      for (var m in b.values) {
        if (!b.values.hasOwnProperty(m)) continue;
        metrics.push({ key:m, label:metricLabel(m), value:b.values[m], unit:unitFor(c, m) || metricUnit(m),
                       text: fmtNum(b.values[m]) + ' ' + (unitFor(c, m) || metricUnit(m)) });
      }
      out.push({ key:c, label:labelFor(TYPES, c), short:shortFor(c), metrics:metrics,
                 values:b.values, mw:mw, sized:metrics.length > 0, paths:b.paths,
                 text: metrics.length ? metrics.map(function (x) { return x.text; }).join(' · ')
                                      : 'size not stated' });
    }
    out.sort(function (a, b) { return (b.mw || 0) - (a.mw || 0); });
    return opts.withUnknown ? { sizes:out, unknown:unknown, unresolved:unresolved } : out;
  }

  function metricLabel(m) {
    return { powerMw:'Power', energyMwh:'Energy', dcKw:'DC', itLoadMw:'IT load',
             ports:'Ports', hours:'Duration' }[m] || m;
  }
  function metricUnit(m) {
    return { powerMw:'MW', energyMwh:'MWh', dcKw:'kW', itLoadMw:'MW',
             ports:'ports', hours:'h' }[m] || '';
  }

  /* What the extractor found and what it couldn't place, for one record.
     This is the panel that turns "why is this empty" into a field name. */
  function sizingReport(rec) {
    var raw = (rec && rec._raw) || {};
    if (rec && rec.source === 'editor') {
      var r = deepSizes(raw, { withUnknown:true });
      var un = [];
      for (var p in r.unknown) if (r.unknown.hasOwnProperty(p)) un.push({ path:p, n:r.unknown[p] });
      un.sort(function (a, b) { return b.n - a.n; });
      var ur = [];
      for (var q in r.unresolved) if (r.unresolved.hasOwnProperty(q)) ur.push({ path:q, n:r.unresolved[q] });
      ur.sort(function (a, b) { return b.n - a.n; });
      return { sizes:r.sizes, unknown:un.slice(0, 30), unresolved:ur.slice(0, 20),
               hasScopeMap:false, topKeys:Object.keys(raw).slice(0, 40) };
    }
    return { sizes:scopeSizes(rec), unknown:[], unresolved:[],
             hasScopeMap: !!(raw.scope && typeof raw.scope === 'object'),
             topKeys:Object.keys(raw).slice(0, 40) };
  }

  /* ── The equipment registry ──────────────────────────────────────────────
     A site drawn in the editor places equipment, and the rules tell us saved
     projects store a `catalogKey` rather than the capacity itself. So a
     project can be full of batteries and inverters and carry no kW anywhere
     in its own document — the numbers live in /equipment (the per-org
     overlay) and in the seed catalogs inside editor.html.

     This resolves the overlay half. Items whose catalogKey points at a SEED
     entry still won't resolve, because those seeds are in editor.html and
     not in this repo — such items are counted and reported by name in the
     diagnostic rather than silently sized at zero.

     Read is scoped to `orgId == userOrg() || isAdmin()` in the live rules,
     so this returns the full cross-org registry for a ClearSky address and
     only their own for a rep on another domain. Non-fatal either way. */
  var _equip = {};

  function loadEquipment() {
    if (!_db) return Promise.resolve({});
    return _db.collection('equipment').get().then(function (snap) {
      var map = {};
      snap.forEach(function (doc) {
        var d = doc.data() || {};
        /* Archived entries are INDEXED, not skipped. The rules' own note on
           this collection says archiving hides a SKU from pickers while
           keeping old projects readable — so a project that placed one still
           has that capacity on the ground. Skipping them silently shrank
           every older site. */
        var e = {
          archived: d.archived === true,
          key:      d.key || doc.id,
          cat:      d.cat || '', sub: d.sub || '', type: d.type || '',
          orgId:    String(d.orgId || '').toLowerCase(),
          label:    [d.manufacturer, d.model].filter(Boolean).join(' ') || (d.key || doc.id),
          powerKw:  num(d.powerKw) != null ? num(d.powerKw)
                  : num(d.pmaxKw) != null ? num(d.pmaxKw)
                  : num(d.pnomKva),
          energyKwh: num(d.energyKwh)
        };
        /* Indexed under both the doc id and the `key` field: the rules say
           projects store a catalogKey, and which of the two that is isn't
           stated. Indexing both costs nothing and removes the guess. */
        map[String(doc.id)] = e;
        if (d.key) map[String(d.key)] = e;
      });
      _equip = map;
      return map;
    })['catch'](function (err) {
      console.warn('[ops] equipment registry unreadable — placed items will not be sized:', err && err.message);
      _equip = {};
      return {};
    });
  }

  var CATALOG_KEYS = ['catalogKey','equipmentKey','equipKey','sku','productKey','modelKey'];

  /* The catalog entry a placed node points at, plus how many of it. */
  function placedItem(node) {
    for (var i = 0; i < CATALOG_KEYS.length; i++) {
      var k = node[CATALOG_KEYS[i]];
      if (k && _equip[String(k)]) {
        var qty = num(node.qty) || num(node.quantity) || num(node.count) || 1;
        return { entry:_equip[String(k)], qty:qty, key:String(k) };
      }
    }
    return null;
  }
  /* A catalogKey we could not resolve — a seed entry from editor.html, or a
     registry we were not allowed to read. Reported, never sized at zero. */
  function unresolvedKey(node) {
    for (var i = 0; i < CATALOG_KEYS.length; i++) {
      var k = node[CATALOG_KEYS[i]];
      if (k && !_equip[String(k)]) return String(k);
    }
    return null;
  }

  var USER_COLL = 'team_members';

  function userDocId(orgId, email) {
    return String(orgId || '').toLowerCase() + '__' + String(email || '').toLowerCase();
  }

  /* Doc IDs are "<orgId>__<email>", so a documentId() range pulls one org's
     people without needing a collection-wide read. That matters: rules that
     let staff read every tenant's directory are a bigger grant than rules
     that let them read one tenant's at a time. */
  function loadOrgUsers(orgId, reqs) {
    var org = String(orgId || '').toLowerCase();
    var found = {}, order = [];

    function add(email, patch) {
      var key = String(email || '').toLowerCase();
      if (!key || key.indexOf('@') < 0) return;
      if (!found[key]) { found[key] = { email:key, orgId:org, name:'', role:'', active:true,
                                        source:'observed', docId:userDocId(org, key),
                                        inDirectory:false, lastSeen:0, intakes:0 };
                         order.push(key); }
      var u = found[key];
      for (var f in patch) if (patch.hasOwnProperty(f) && patch[f] != null && patch[f] !== '') u[f] = patch[f];
      return u;
    }

    /* Source 2 first so the directory's better data overwrites it. */
    (reqs || []).forEach(function (r) {
      if (r.orgId !== org) return;
      var u = add(r.contactEmail, { name: r.contactName, role: r.contactRole });
      if (!u) return;
      u.intakes++;
      var w = Math.max(ms(r.submittedAt), ms(r._raw && r._raw.createdAt));
      if (w > u.lastSeen) u.lastSeen = w;
    });

    if (!_db) return Promise.resolve(order.map(function (k) { return found[k]; }));

    var FP;
    try { FP = firebase.firestore.FieldPath.documentId(); } catch (e) { FP = null; }
    var q = FP
      ? _db.collection(USER_COLL).where(FP, '>=', org + '__').where(FP, '<', org + '__\uf8ff')
      : _db.collection(USER_COLL).where('orgId', '==', org);

    return q.get().then(function (snap) {
      snap.forEach(function (doc) {
        var d = doc.data() || {};
        var email = String(d.email || doc.id.split('__')[1] || '').toLowerCase();
        var u = add(email, { name:d.name || d.displayName, role:d.role });
        if (!u) return;
        u.source = 'directory';
        u.inDirectory = true;
        u.docId = doc.id;
        u.active = d.active !== false && d.access !== 'suspended';
        u.suspendedAt = d.suspendedAt || null;
        u.suspendedBy = d.suspendedBy || '';
        u.resetSentAt = d.passwordResetSentAt || null;
        var w = ms(d.lastSeenAt || d.updatedAt || d.createdAt);
        if (w > u.lastSeen) u.lastSeen = w;
      });
      return order.map(function (k) { return found[k]; });
    })['catch'](function (err) {
      console.warn('[ops] ' + USER_COLL + ' unreadable for ' + org + ' — showing contacts observed on intakes only:', err && err.message);
      return order.map(function (k) { return found[k]; });
    }).then(function (list) {
      /* Overlay what only the Admin SDK can see. Where the two disagree the
         Auth record wins on `active`: Firestore holds our INTENTION to
         suspend, Auth holds whether it actually happened, and an operator
         needs the second one. The disagreement itself is surfaced —
         `flagOnly` means the flag is set and the account is still open, which
         is precisely the state the pre-server console leaves behind. */
      return lookupUsers(order).then(function (byEmail) {
        if (byEmail) {
          list.forEach(function (u) {
            var a = byEmail[u.email];
            if (!a) return;
            u.authKnown    = true;
            u.exists       = a.exists;
            u.hasPassword  = a.hasPassword;
            u.providers    = a.providers || [];
            u.lastSignInAt = a.lastSignInAt || null;
            u.flagOnly     = !u.active && a.exists && !a.disabled;
            if (a.exists) u.active = !a.disabled;
            var w = ms(a.lastSignInAt);
            if (w > u.lastSeen) u.lastSeen = w;
          });
        }
        return list.sort(function (a, b) { return b.lastSeen - a.lastSeen; });
      });
    });
  }

  /* Suspending a user goes through the server when one is deployed — which
     disables the Auth account AND revokes live sessions — and falls back to
     the Firestore flag when it isn't. The two outcomes are genuinely
     different, so the resolved value says which one happened and the caller
     is expected to tell the operator. Reporting "Suspended." for both would
     make the inert case indistinguishable from the real one. */
  function setUserAccess(orgId, email, suspended, reason) {
    if (adminAvailable()) {
      return callFn('omegaSetUserAccess', {
        orgId: String(orgId || '').toLowerCase(),
        email: String(email || '').toLowerCase(),
        suspended: !!suspended,
        reason: reason || ''
      }).then(function (r) {
        return { enforced: r.authApplied === true, message: r.message || '' };
      });
    }
    if (!_db) return Promise.reject(new Error('No database connection.'));
    var body = {
      orgId:     String(orgId || '').toLowerCase(),
      email:     String(email || '').toLowerCase(),
      active:    !suspended,
      access:    suspended ? 'suspended' : 'active',
      updatedAt: stamp(),
      updatedBy: _me.email || ''
    };
    if (suspended) { body.suspendedAt = stamp(); body.suspendedBy = _me.email || '';
                     body.suspendedReason = reason || ''; }
    else           { body.suspendedAt = null;    body.suspendedBy = ''; body.suspendedReason = ''; }
    return _db.collection(USER_COLL).doc(userDocId(orgId, email)).set(body, { merge:true })
      .then(function () { return { enforced:false, message:'' }; });
  }

  /* The reset LINK, minted server-side and handed back rather than emailed.
     For the client whose mailbox is broken — staff read it out. Distinct from
     the client-side sendPasswordResetEmail the console also offers: that one
     needs no server and mails them directly, this one needs a server and
     doesn't. Both end with the client choosing their own password. */
  function passwordResetLink(orgId, email) {
    return callFn('omegaPasswordResetLink', {
      orgId: String(orgId || '').toLowerCase(),
      email: String(email || '').toLowerCase()
    });
  }

  function noteResetSent(orgId, email) {
    if (!_db) return Promise.resolve(null);
    return _db.collection(USER_COLL).doc(userDocId(orgId, email)).set({
      orgId: String(orgId || '').toLowerCase(),
      email: String(email || '').toLowerCase(),
      passwordResetSentAt: stamp(),
      passwordResetSentBy: _me.email || ''
    }, { merge:true })['catch'](function (e) {
      /* The email has already gone. Failing to log it is not worth failing
         the action over — the operator would resend and mail them twice. */
      console.warn('[ops] reset sent but not logged:', e && e.message);
      return null;
    });
  }

  /* Org-level suspension writes `suspended`, NOT `active:false`.
     byTenant() drops registry rows with active===false entirely, so reusing
     that field would make a suspended client vanish from the console instead
     of appearing as suspended — the one state where you most want to still
     see them. Two fields, two meanings: `active:false` de-registers, this
     locks. */
  function setOrgAccess(orgId, suspended, reason) {
    if (adminAvailable()) {
      return callFn('omegaSetOrgAccess', {
        orgId: String(orgId || '').toLowerCase(),
        suspended: !!suspended,
        reason: reason || ''
      }).then(function (r) {
        return { enforced:true, message:r.message || '',
                 applied:r.applied || [], failed:r.failed || [] };
      });
    }
    if (!_db) return Promise.reject(new Error('No database connection.'));
    var key = String(orgId || '').toLowerCase();
    var docId = key;
    for (var i = 0; i < _orgs.length; i++) if (_orgs[i].orgId === key && _orgs[i].docId) docId = _orgs[i].docId;
    var body = {
      orgId:     key,
      suspended: !!suspended,
      updatedAt: stamp(),
      updatedBy: _me.email || ''
    };
    if (suspended) { body.suspendedAt = stamp(); body.suspendedBy = _me.email || '';
                     body.suspendedReason = reason || ''; }
    else           { body.suspendedAt = null;    body.suspendedBy = ''; body.suspendedReason = ''; }
    return _db.collection('omega_orgs').doc(docId).set(body, { merge:true })
      .then(function () { return { enforced:false, message:'', applied:[], failed:[] }; });
  }

  function orgRecord(orgId) {
    var key = String(orgId || '').toLowerCase();
    for (var i = 0; i < _orgs.length; i++) if (_orgs[i].orgId === key) return _orgs[i];
    return null;
  }
  function isOrgSuspended(orgId) {
    var o = orgRecord(orgId);
    return !!(o && o.suspended);
  }

  /* Has anyone actually wired the flags into the tenants' rules? Nothing in
     the browser can verify that, so it's a config assertion the deployer
     makes on purpose — defaulting to false so the UI's honest until someone
     has genuinely done the work. */
  /* True when a suspension actually stops somebody. Two independent routes
     get you there and either is sufficient:
       · the Cloud Functions are deployed — the Auth account is disabled and
         live sessions revoked, which works whatever the rules say
       · the tenant rules read the flag — no server needed, but it only bites
         on the next Firestore read
     Both false means the flag is inert, and the console says so. */
  function suspendEnforced() {
    var ac = ops().accessControl || {};
    return ac.enforced === true || adminAvailable();
  }
  /* Which of the two, for wording that tells an operator what they just did. */
  function enforcementMode() {
    var ac = ops().accessControl || {};
    if (adminAvailable()) return 'server';
    if (ac.enforced === true) return 'rules';
    return 'none';
  }

  /* ── Sample data ─────────────────────────────────────────────────────────
     In-memory only, never written, every record flagged _demo. Shaped like a
     real intake_projects document (nested `customer`, `quote.total`) so it
     also exercises the field-tolerance paths. */
  function sample() {
    var now = Date.now();
    function t(hr) { return new Date(now - hr * HOUR).toISOString(); }
    var monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0,0,0,0);
    var recentDone = Math.max(now - 60 * HOUR, monthStart.getTime() + 6 * HOUR);
    if (recentDone > now) recentDone = now - HOUR;
    function fd(hr) { return new Date(recentDone - hr * HOUR).toISOString(); }

    /* Built in the real intake_projects shape — nested customer/project,
       scope as {key:{enabled}}, deliverables as objects with `requested` —
       so the sample exercises the same mapping the live data does. Anything
       that renders here renders there. */
    function del(keys, doneKeys) {
      return SCOPE.map(function (s) {
        return { key:s.key, label:s.label,
                 requested: keys.indexOf(s.key) >= 0,
                 status: (doneKeys || []).indexOf(s.key) >= 0 ? 'delivered' : 'not_started',
                 outputUrl:'', note:'', updatedAt:null };
      });
    }
    function sc(map) {
      var out = {};
      TYPES.forEach(function (x) { out[x.key] = { enabled:false }; });
      for (var k in map) if (map.hasOwnProperty(k)) out[k] = map[k];
      return out;
    }

    var rows = [
      { orgId:'fenecon.com', tenantName:'FENECON', purpose:'service', routing:'omega',
        status:'submitted', submittedAt:t(3.4),
        customer:{ company:'FENECON', contactName:'Anna Bauer', email:'a.bauer@fenecon.com', role:'Developer' },
        project:{ name:'Munich DC — 4h BESS', city:'Garching', state:'DE',
                  notes:'Utility wants the one-line before their Thursday review.' },
        scope: sc({ bess:{ enabled:true, powerMw:12.5, energyMwh:50, useCase:'Peak shaving' } }),
        deliverables: del(['siteplan','loadstudy','costs']),
        quote:{ total:null, currency:'USD' }, admin:{ priority:'urgent', assignee:'' } },

      { orgId:'sunesol.com', tenantName:'SunESol', purpose:'service', routing:'omega',
        status:'submitted', submittedAt:t(26),
        customer:{ company:'SunESol', contactName:'Dana Ruiz', email:'dana@sunesol.com' },
        project:{ name:'Fresno depot — DCFC', city:'Fresno', state:'CA' },
        scope: sc({ dcfc:{ enabled:true, dispensers:6 } }),
        deliverables: del(['siteplan','sitemap','utility']),
        quote:{ total:null }, admin:{ priority:'normal' } },

      { orgId:'iqgen.energy', tenantName:'iQGen Technologies', purpose:'service', routing:'omega',
        status:'in_production', submittedAt:t(52), firstResponseAt:t(50.5), startedAt:t(46),
        customer:{ company:'iQGen Technologies', contactName:'Priya Raman', email:'priya@iqgen.energy' },
        project:{ name:'Odessa TX — solar + storage', city:'Odessa', state:'TX' },
        scope: sc({ solar:{ enabled:true, dcKw:40000 }, bess:{ enabled:true, powerMw:20, energyMwh:40 } }),
        deliverables: del(['siteplan','costs','loadstudy'], ['siteplan']),
        editorProjectId:'demo-proj-1', editorProjectName:'Odessa TX',
        quote:{ total:88000, currency:'USD' },
        admin:{ priority:'high', assignee:'tom@clearsky-usa.com', assigneeName:'Thomas' } },

      { orgId:'nextnrg.com', tenantName:'NextNRG', purpose:'service', routing:'omega',
        status:'quoted', submittedAt:t(140), firstResponseAt:t(133),
        customer:{ company:'NextNRG', contactName:'Marcus Hale', email:'marcus@nextnrg.com' },
        project:{ name:'Tampa microgrid screen', city:'Tampa', state:'FL' },
        scope: sc({ der:{ enabled:true, capacityKw:8000, islandMode:true } }),
        deliverables: del(['interconnect','costs']),
        quote:{ total:42000, currency:'USD', sentAt:t(133) },
        admin:{ priority:'normal', assignee:'tom@clearsky-usa.com', assigneeName:'Thomas' } },

      { orgId:'spatco.com', tenantName:'SPATCO', purpose:'build', routing:'self',
        status:'saved', submittedAt:null, createdAt:t(88),
        customer:{ company:'SPATCO', contactName:'Ellis Ward', email:'ellis@spatco.com' },
        project:{ name:'Charlotte yard — self serve', city:'Charlotte', state:'NC' },
        scope: sc({ l2:{ enabled:true, ports:8, kwPerPort:11.5 } }),
        deliverables: del([]), quote:{ total:null }, admin:{ priority:'normal' } },

      { orgId:'concordenergyusa.com', tenantName:'Concord Energy', purpose:'service', routing:'omega',
        status:'delivered', submittedAt:fd(240), firstResponseAt:fd(237.5), startedAt:fd(230),
        completedAt:new Date(recentDone).toISOString(),
        customer:{ company:'Concord Energy', contactName:'Dale Whitcomb', email:'dale@concordenergyusa.com' },
        project:{ name:'Cedar Rapids fleet depot', city:'Cedar Rapids', state:'IA' },
        scope: sc({ dcfc:{ enabled:true, dispensers:4 } }),
        deliverables: del(['siteplan','ahj'], ['siteplan','ahj']),
        editorProjectId:'demo-proj-2',
        quote:{ total:47000, currency:'USD', paymentStatus:'paid', paidAt:fd(4) },
        admin:{ priority:'high', assignee:'tom@clearsky-usa.com', assigneeName:'Thomas' } },

      { orgId:'sunesol.com', tenantName:'SunESol', purpose:'service', routing:'omega',
        status:'delivered', submittedAt:t(1100), firstResponseAt:t(1078), completedAt:t(820),
        commissionPaidAt:t(300),
        customer:{ company:'SunESol', contactName:'Dana Ruiz', email:'dana@sunesol.com' },
        project:{ name:'Bakersfield rooftop', city:'Bakersfield', state:'CA' },
        scope: sc({ solar:{ enabled:true, dcKw:2100 } }),
        deliverables: del(['costs'], ['costs']),
        quote:{ total:18500, currency:'USD' },
        admin:{ priority:'normal', assignee:'tom@clearsky-usa.com', assigneeName:'Thomas' } },

      { orgId:'fenecon.com', tenantName:'FENECON', purpose:'service', routing:'omega',
        status:'changes_requested', submittedAt:t(300), firstResponseAt:t(292),
        customer:{ company:'FENECON', contactName:'Jonas Mehl', email:'j.mehl@fenecon.de' },
        project:{ name:'Ulm C&I retrofit', city:'Ulm', state:'DE' },
        scope: sc({ bess:{ enabled:true, powerMw:1.4 } }),
        deliverables: del(['costs']),
        quote:{ total:12000, currency:'USD' },
        admin:{ priority:'normal', assignee:'tom@clearsky-usa.com', assigneeName:'Thomas',
                internalNotes:'Waiting on landlord roof-loading confirmation.' } },

      { orgId:'iqgen.energy', tenantName:'iQGen Technologies', purpose:'service', routing:'omega',
        status:'declined', submittedAt:t(700), firstResponseAt:t(690),
        customer:{ company:'iQGen Technologies', contactName:'Marcus Hale', email:'marcus@iqgen.energy' },
        project:{ name:'El Paso compute screen', city:'El Paso', state:'TX' },
        scope: sc({ compute:{ enabled:true, itLoadMw:75 } }),
        deliverables: del(['interconnect']),
        quote:{ total:60000, currency:'USD' }, admin:{ priority:'normal' } }
    ];

    var out = [];
    for (var i = 0; i < rows.length; i++) {
      rows[i]._demo = true;
      rows[i].intakeId = 'demo-' + (i + 1);
      out.push(normalize('demo-' + (i + 1), rows[i]));
    }
    out.sort(function (a, b) { return ms(b.submittedAt) - ms(a.submittedAt); });
    return out;
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  /* Anything in the raw document the console didn't map, rendered in the
     drawer so a wrong field guess shows as visible data rather than a blank
     row nobody notices. */
  var KNOWN = ['intakeId','schemaVersion','orgId','tenantKey','tenantName','createdBy',
    'createdAt','updatedAt','submittedAt','completedAt','purpose','routing','status',
    'editorProjectId','editorProjectName','quote','acceptance','customer','project',
    'scope','links','categories','deliverables','activity','admin','notify',
    'firstResponseAt','startedAt','commissionRate','commissionPaidAt',
    'messages','payment','files','_demo'];

  function unmapped(req) {
    var raw = req._raw || {}, out = {}, n = 0;
    for (var k in raw) {
      if (!raw.hasOwnProperty(k)) continue;
      if (KNOWN.indexOf(k) >= 0) continue;
      out[k] = raw[k]; n++;
    }
    return n ? out : null;
  }

  global.OpsData = {
    STATUS:STATUS, PRIORITY:PRIORITY, SCOPE:SCOPE, TYPES:TYPES, PURPOSE:PURPOSE,
    statusOf:statusOf, priorityOf:priorityOf, labelFor:labelFor,
    tenantName:tenantName, isInternalOrg:isInternalOrg, orgs:orgs,
    ms:ms, fmtDate:fmtDate, fmtDateTime:fmtDateTime, fmtDur:fmtDur,
    fmtAgo:fmtAgo, fmtMoney:fmtMoney, esc:esc,
    targetMs:targetMs, responseMs:responseMs, answered:answered, clock:clock,
    value:value, rate:rate, payout:payout, payableStatus:payableStatus,
    isEarned:isEarned, isPaid:isPaid, dueMs:dueMs, cycleMs:cycleMs,
    inQueue:inQueue, isBlocked:isBlocked, pick:pick, unmapped:unmapped,
    QUOTE_TIERS:QUOTE_TIERS, quotePayload:quotePayload, messagePayload:messagePayload,
    deliverablesPayload:deliverablesPayload, serverStamp:serverStamp,
    uploadFile:uploadFile, fileUrl:fileUrl, removeFile:removeFile, filesFor:filesFor,
    fmtBytes:fmtBytes, MAX_FILE_MB:MAX_FILE_MB,
    enabledScopes:enabledScopes, deliverableProgress:deliverableProgress,
    priorityKey:priorityKey,
    normalize:normalize, init:init, collectionName:collectionName,
    loadRequests:loadRequests, loadOrgs:loadOrgs,
    loadStaff:loadStaff, ensureSelfStaff:ensureSelfStaff, setStaffRole:setStaffRole,
    assignableStaff:assignableStaff,
    patch:patch, createLinkedProject:createLinkedProject,
    summarize:summarize, byTenant:byTenant, byStaff:byStaff, sample:sample,

    /* Sizing + finance screening */
    SIZE:SIZE, scopeSizes:scopeSizes, sizeMw:sizeMw, sizeText:sizeText,
    fmtNum:fmtNum, qualify:qualify, financeCfg:financeCfg,
    portfolio:portfolio, opportunities:opportunities,
    loadProjects:loadProjects, normalizeProject:normalizeProject,
    loadEquipment:loadEquipment, equipment:function(){ return _equip; },
    deepSizes:deepSizes, sizingReport:sizingReport,

    /* Tenant accounts and their users */
    loadOrgUsers:loadOrgUsers, setUserAccess:setUserAccess, noteResetSent:noteResetSent,
    setOrgAccess:setOrgAccess, orgRecord:orgRecord, isOrgSuspended:isOrgSuspended,
    suspendEnforced:suspendEnforced, enforcementMode:enforcementMode,
    adminAvailable:adminAvailable, passwordResetLink:passwordResetLink,
    lookupUsers:lookupUsers, userDocId:userDocId
  };
})(window);
