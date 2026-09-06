/* ══════════════════════════════════════════════════════════════════════════
   CLEARSKY-OMEGA · SERVICE DELIVERY CONSOLE  (omega-delivery.js)

   A tenant-neutral module for a SERVICES firm — an engineering or development
   shop that takes work in from its own customers, moves it through a defined
   set of service lines, and hands finished packages back.

   It ships dark. A deployment turns it on in that deployment's /config.js
   under `tenant.delivery`. No tenant name, domain or colour appears in this
   file, and it must stay that way — this is a shared platform file.

   ─────────────────────────────────────────────────────────────────────────
   WHY THIS EXISTS, NEXT TO omega-assets.js
   ─────────────────────────────────────────────────────────────────────────
   The stock dashboard asks a developer's questions: how many sites, what
   stage, how much storage quoted. omega-assets.js asks an owner's: what do
   we own, what is it worth, who is bidding.

   A services firm asks a third set, and it is the only one about OTHER
   people's projects:

       What came in, and how long has it been sitting?      → response clock
       What did they ask us to produce?                     → service lines
       Where is each job, and what is late?                 → the queue
       What is ready to draw?                               → editor handoff

   Nothing above is answerable from `projects` alone, because a referral
   exists before any project does — which is the whole point of an intake.

   ─────────────────────────────────────────────────────────────────────────
   ⚠ THIS IS NOT THE OMEGA PROJECT INTAKE
   ─────────────────────────────────────────────────────────────────────────
   The platform intake writes to `intake_projects`, is read by the ClearSky
   ops console, and carries commission, quoting and staff assignment. Records
   there are work ClearSky owes somebody a reply on.

   This module reads a SEPARATE collection (`delivery.collection`, default
   `referrals`). A tenant's own referrals are their internal book of work.
   Putting them in `intake_projects` would drop them into ClearSky's delivery
   queue, start a ClearSky SLA clock on them, and put the tenant's customers
   in front of ClearSky staff. Do not point `delivery.collection` at
   `intake_projects` to "unify the queues" — that is not a unification, it is
   a leak, and the SLA averages on the ops console would be the first thing
   to go strange.

   The STATUS KEYS below deliberately match `intake_projects`' vocabulary
   even though the collections are separate. That is so a tenant who later
   graduates onto the real intake migrates by copying documents rather than
   translating them. Labels differ where a services firm would say something
   else ("Referred" for `submitted`); the keys do not.

   ─────────────────────────────────────────────────────────────────────────
   DOCUMENT SHAPE  —  {collection}/{id}
   ─────────────────────────────────────────────────────────────────────────
     orgId          string    tenant lock. Scopes every read.
     clientName     string    THEIR customer — not the tenant.
     contactName    string
     contactEmail   string
     projectName    string
     projectType    string    one of TYPES[].key
     address        string
     scopes         [string]  service lines requested; keys from delivery.services
     capacityMw     number
     durationHrs    number
     priority       string    'critical' | 'rush' | 'standard'
     status         string    one of STATUS[].key
     notes          string
     dueDate        'YYYY-MM-DD'
     referredBy     string    who sent it in — the referral source
     attachments    [ {name, url, kind:'link'|'file', path, size, addedAt, addedBy} ]
     editorProjectId string   set when a project is opened in the editor
     createdAt / updatedAt / submittedAt / firstResponseAt / completedAt

   Everything except orgId and status degrades safely if absent.

   ─────────────────────────────────────────────────────────────────────────
   RESPONSE CLOCK — what it can and cannot tell you
   ─────────────────────────────────────────────────────────────────────────
   The metric is FIRST RESPONSE: submittedAt → firstResponseAt. The moment
   somebody replied, not the moment the work finished.

   It is NOT retroactive. Referrals logged before this shipped read "—"
   forever. A record already at `quoted` or beyond with no stamp counts as
   ANSWERED but UNMEASURED — clearly somebody replied, they priced it — and
   it shows as "—" rather than as zero. Counting it zero would flatter the
   median with work nobody measured, so the count of those is printed
   underneath instead of being hidden.

   Targets are wall-clock, not business hours. A standard referral landing
   6pm Friday is amber by Saturday lunchtime with nobody at fault. Once
   volume makes that unfair, add a business-hours calendar here — not a
   longer target, which would also slacken the weekday number that matters.
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var BLOCK_KEY = 'delivery';
  var MOUNTED   = false;

  /* ── Config ───────────────────────────────────────────────────────────── */

  function tenant() {
    return global.OMEGA_WORKSPACE ||
           (global.CLEARSKY_CONFIG && global.CLEARSKY_CONFIG.tenant) || {};
  }

  function cfg() {
    var d = tenant().delivery || {};
    return {
      enabled:     d.enabled === true,           // OFF unless asked for
      collection:  d.collection || 'referrals',
      insertAfter: d.insertAfter || 'apps',
      title:       d.title || 'Service Delivery',
      subtitle:    d.subtitle ||
                   'Work referred in by your customers, by service line.',
      sampleData:  d.sampleData === true,
      intakeHref:  d.intakeHref || '/intake.html',
      queueHref:   d.queueHref  || '/queue.html',
      services:    (d.services && d.services.length) ? d.services : DEFAULT_SERVICES,
      sla:         d.sla || { critical: 2, rush: 8, standard: 24 },
      warnAt:      (d.warnAt == null ? 0.6 : Number(d.warnAt)),
      deliveryDays: d.deliveryDays || { critical: 3, rush: 7, standard: 14 },
      marketplaceKey: d.marketplaceKey || null,
      currency:    d.currency || 'USD'
    };
  }

  /* ── The model ────────────────────────────────────────────────────────── */

  /* Status keys mirror intake_projects. Labels are the services-firm voice.
     Do not invent keys here without adding them to the rules' status list —
     a write with an unknown status is refused, and the referral silently
     fails to move. */
  var STATUS = [
    { key:'draft',             label:'Draft',              short:'Draft',    color:'#9CA3AF', pipeline:false, pre:true,
      hint:'Not logged yet. Still being typed.' },
    { key:'submitted',         label:'Referred',           short:'New',      color:'#0070F2', pipeline:true,
      hint:'Logged. Nobody has picked it up \u2014 the response clock is running.' },
    { key:'in_review',         label:'Scoping',            short:'Scoping',  color:'#6366F1', pipeline:true,
      hint:'Working out what the job actually is, before pricing it.' },
    { key:'quoted',            label:'Proposal sent',      short:'Quoted',   color:'#8B5CF6', pipeline:true,
      hint:'A proposal is with the customer, waiting on approval.' },
    { key:'changes_requested', label:'Needs customer input',short:'Blocked', color:'#D97706', pipeline:false,
      hint:'Waiting on something from the customer. Off the board until they reply.' },
    { key:'accepted',          label:'Accepted',           short:'Accepted', color:'#0EA5E9', pipeline:true,
      hint:'Approved and scheduled. Ready to start engineering.' },
    { key:'in_production',     label:'In production',      short:'Building', color:'#00A9A4', pipeline:true,
      hint:'Being produced. Usually linked to an editor project.' },
    { key:'delivered',         label:'Delivered',          short:'Delivered',color:'#16A34A', pipeline:true,
      hint:'Package issued to the customer.' },
    { key:'declined',          label:'Declined',           short:'Declined', color:'#DC2626', pipeline:false,
      hint:'Customer did not proceed.' }
  ];

  /* Project technology. Distinct from SERVICE LINES below — a single solar
     site can carry four service lines, and a diligence job can cover a
     technology nobody has chosen yet. Conflating the two is why a queue
     grouped "by type" tells a services firm nothing about its own capacity. */
  var TYPES = [
    { key:'solar',   label:'Solar PV',                     short:'Solar' },
    { key:'bess',    label:'Battery storage',              short:'BESS' },
    { key:'hybrid',  label:'Solar + storage',              short:'Hybrid' },
    { key:'wind',    label:'Wind',                         short:'Wind' },
    { key:'compute', label:'Data center / compute',        short:'Compute' },
    { key:'ev',      label:'EV charging',                  short:'EV' },
    { key:'other',   label:'Other / not yet decided',      short:'Other' }
  ];

  var PRIORITY = [
    { key:'critical', label:'Critical', color:'#DC2626' },
    { key:'rush',     label:'Rush',     color:'#D97706' },
    { key:'standard', label:'Standard', color:'#556B82' }
  ];

  /* Fallback service lines if a deployment names none. Deliberately generic:
     a tenant's real catalogue belongs in their /config.js, because it is a
     description of THEIR business and it will change without this file
     changing. */
  var DEFAULT_SERVICES = [
    { key:'diligence',      label:'Site diligence' },
    { key:'engineering',    label:'Engineering' },
    { key:'interconnection',label:'Interconnection' },
    { key:'permitting',     label:'Permitting' },
    { key:'other',          label:'Other' }
  ];

  function statusOf(key) {
    for (var i = 0; i < STATUS.length; i++) if (STATUS[i].key === key) return STATUS[i];
    return { key: key || 'unknown', label: key || 'Unknown', short: key || '?',
             color: '#6B7280', pipeline: false, hint: '' };
  }
  function typeOf(key) {
    for (var i = 0; i < TYPES.length; i++) if (TYPES[i].key === key) return TYPES[i];
    return { key: key || 'other', label: key || 'Other', short: key || 'Other' };
  }
  function serviceOf(key) {
    var list = cfg().services;
    for (var i = 0; i < list.length; i++) if (list[i].key === key) return list[i];
    /* An unknown service key is REPORTED, not dropped. A referral tagged with
       a service line somebody removed from config is still a real job, and
       silently hiding it is how work goes missing. */
    return { key: key, label: key, unknown: true };
  }
  function priorityOf(key) {
    var k = String(key || 'standard').toLowerCase();
    if (k === 'normal') k = 'standard';            // the intake's own default
    if (k === 'urgent' || k === 'high') k = 'rush';
    for (var i = 0; i < PRIORITY.length; i++) if (PRIORITY[i].key === k) return PRIORITY[i];
    return PRIORITY[2];
  }

  /* ── Helpers ──────────────────────────────────────────────────────────── */

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* Firestore Timestamps, ISO strings and Dates all arrive here. Anything
     unparseable returns null rather than an Invalid Date, which would render
     as "NaN hours" on the clock. */
  function toDate(v) {
    if (!v) return null;
    if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
    if (typeof v.toDate === 'function') { try { return v.toDate(); } catch (e) { return null; } }
    if (typeof v === 'number') { var n = new Date(v); return isNaN(n.getTime()) ? null : n; }
    var d = new Date(String(v));
    return isNaN(d.getTime()) ? null : d;
  }

  function fmtDate(d) {
    d = toDate(d);
    if (!d) return '\u2014';
    var m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return m[d.getMonth()] + ' ' + d.getDate();
  }

  /* Elapsed time reads as a duration, not a decimal. "31h" and "1.3 days"
     are the same number and only one of them is answerable. */
  function fmtHours(h) {
    if (h == null || !isFinite(h)) return '\u2014';
    if (h < 1)  return Math.max(1, Math.round(h * 60)) + 'm';
    if (h < 48) return (h < 10 ? h.toFixed(1) : Math.round(h)) + 'h';
    return Math.round(h / 24) + 'd';
  }

  function hoursBetween(a, b) {
    a = toDate(a); b = toDate(b) || new Date();
    if (!a) return null;
    return (b - a) / 3600000;
  }

  function median(list) {
    var v = list.filter(function (n) { return n != null && isFinite(n); })
                .sort(function (x, y) { return x - y; });
    if (!v.length) return null;
    var m = Math.floor(v.length / 2);
    return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
  }

  /* ── Normalize ────────────────────────────────────────────────────────── */

  /* Field names are matched against a candidate list rather than assumed, the
     same tolerance the ops console uses. A record written by an older form,
     or imported from a spreadsheet, degrades to "not stated" instead of to a
     confident wrong value. */
  function pick(raw, names) {
    for (var i = 0; i < names.length; i++) {
      var v = raw[names[i]];
      if (v !== undefined && v !== null && v !== '') return v;
    }
    return null;
  }

  function normalize(id, raw) {
    raw = raw || {};
    var scopes = raw.scopes || raw.scope || raw.services || [];
    if (!Array.isArray(scopes)) {
      /* `scope` on an intake record is a MAP of {key:{enabled}}, not a list.
         Reading a map as truthy marks every service requested, because
         {enabled:false} is itself truthy. Unpack it properly. */
      scopes = Object.keys(scopes).filter(function (k) {
        var v = scopes[k];
        return v === true || (v && v.enabled === true);
      });
    }

    var st = String(raw.status || 'submitted');
    return {
      id:            id,
      orgId:         raw.orgId || '',
      clientName:    pick(raw, ['clientName', 'customer', 'customerName', 'company']) || '',
      contactName:   pick(raw, ['contactName', 'contact']) || '',
      contactEmail:  pick(raw, ['contactEmail', 'email']) || '',
      projectName:   pick(raw, ['projectName', 'name', 'title']) || 'Untitled referral',
      projectType:   String(raw.projectType || raw.type || 'other').toLowerCase(),
      address:       pick(raw, ['address', 'siteAddress', 'location']) || '',
      scopes:        scopes.map(String),
      capacityMw:    Number(pick(raw, ['capacityMw', 'powerMw', 'mw'])) || null,
      durationHrs:   Number(pick(raw, ['durationHrs', 'durationHours'])) || null,
      priority:      priorityOf(raw.priority || (raw.admin && raw.admin.priority)).key,
      status:        st,
      notes:         raw.notes || '',
      referredBy:    pick(raw, ['referredBy', 'source', 'referrer']) || '',
      dueDate:       raw.dueDate || '',
      attachments:   Array.isArray(raw.attachments) ? raw.attachments : [],
      editorProjectId: pick(raw, ['editorProjectId', 'projectId']) || '',
      createdAt:       toDate(raw.createdAt),
      updatedAt:       toDate(raw.updatedAt),
      submittedAt:     toDate(raw.submittedAt || raw.createdAt),
      firstResponseAt: toDate(raw.firstResponseAt),
      completedAt:     toDate(raw.completedAt),
      _raw: raw
    };
  }

  /* ── SLA ──────────────────────────────────────────────────────────────── */

  /* A referral is ANSWERED if it carries a stamp, or if it has moved past the
     point where a reply must have happened. The second case is measured as
     null, not zero — see the header. */
  var ANSWERED_FROM = ['in_review', 'quoted', 'changes_requested', 'accepted',
                       'in_production', 'delivered', 'declined'];

  function slaOf(r) {
    var C = cfg();
    var target = C.sla[r.priority] || C.sla.standard || 24;
    var answered = !!r.firstResponseAt || ANSWERED_FROM.indexOf(r.status) >= 0;

    var responseH = (r.firstResponseAt && r.submittedAt)
      ? hoursBetween(r.submittedAt, r.firstResponseAt) : null;

    /* Only an unanswered record has a clock still running. */
    var elapsedH = answered ? null : hoursBetween(r.submittedAt, new Date());

    var basis = responseH != null ? responseH : elapsedH;
    var state = 'none';
    if (basis != null) {
      if (basis >= target) state = 'bad';
      else if (basis >= target * C.warnAt) state = 'warn';
      else state = 'ok';
    }

    return {
      target:      target,
      answered:    answered,
      measured:    responseH != null,
      /* Answered but with no stamp — the gap the header talks about. */
      unmeasured:  answered && responseH == null,
      responseH:   responseH,
      elapsedH:    elapsedH,
      state:       state,
      /* Overtime keeps counting rather than parking at 100%: a 20-minute miss
         and a two-day miss should not look the same. */
      pct:         basis == null ? 0 : (basis / target)
    };
  }

  function dueOf(r) {
    var C = cfg();
    if (r.status === 'delivered' || r.status === 'declined') return null;
    var due = r.dueDate ? toDate(r.dueDate + 'T23:59:59') : null;
    if (!due) {
      var start = r.firstResponseAt || r.submittedAt;
      if (!start) return null;
      var days = C.deliveryDays[r.priority] || C.deliveryDays.standard || 14;
      due = new Date(toDate(start).getTime() + days * 86400000);
      due.__derived = true;
    }
    var daysLeft = (due - new Date()) / 86400000;
    return { at: due, daysLeft: daysLeft, late: daysLeft < 0, derived: !!due.__derived };
  }

  /* ── Analyse ──────────────────────────────────────────────────────────── */

  function analyse(rows) {
    var C = cfg();
    rows = (rows || []).map(function (r) {
      r.sla = slaOf(r); r.due = dueOf(r); return r;
    });

    var live = rows.filter(function (r) { return !statusOf(r.status).pre; });

    var byStatus = {};
    STATUS.forEach(function (s) { byStatus[s.key] = []; });
    live.forEach(function (r) { (byStatus[r.status] = byStatus[r.status] || []).push(r); });

    /* Service-line load. A referral counts once per service line it carries,
       so the totals here intentionally exceed the referral count — that is
       what "capacity by service" means and the footnote says so. */
    var byService = C.services.map(function (s) {
      var open = [], done = [];
      live.forEach(function (r) {
        if (r.scopes.indexOf(s.key) < 0) return;
        if (r.status === 'delivered') done.push(r);
        else if (r.status !== 'declined') open.push(r);
      });
      return {
        key: s.key, label: s.label, desc: s.desc || '',
        open: open, done: done,
        late: open.filter(function (r) { return r.due && r.due.late; }).length,
        waiting: open.filter(function (r) { return !r.sla.answered; }).length
      };
    });

    /* Referrals carrying no service line at all. Not zero-value — an
       unanswered question about what was actually asked for. */
    var untagged = live.filter(function (r) { return !r.scopes.length; });

    var measured  = live.map(function (r) { return r.sla.measured ? r.sla.responseH : null; });
    var unmeasured = live.filter(function (r) { return r.sla.unmeasured; }).length;

    var waiting = live.filter(function (r) { return !r.sla.answered; });
    var openAll = live.filter(function (r) {
      return r.status !== 'delivered' && r.status !== 'declined';
    });

    return {
      rows: rows, live: live, byStatus: byStatus, byService: byService,
      untagged: untagged,
      kpi: {
        open:        openAll.length,
        waiting:     waiting.length,
        breached:    waiting.filter(function (r) { return r.sla.state === 'bad'; }).length,
        late:        openAll.filter(function (r) { return r.due && r.due.late; }).length,
        inProduction: (byStatus.in_production || []).length,
        delivered:   (byStatus.delivered || []).length,
        medianReply: median(measured),
        unmeasured:  unmeasured,
        mw:          openAll.reduce(function (a, r) { return a + (r.capacityMw || 0); }, 0),
        linked:      openAll.filter(function (r) { return !!r.editorProjectId; }).length
      },
      funnel: ['submitted', 'in_review', 'quoted', 'accepted', 'in_production', 'delivered']
        .map(function (k) {
          return { key: k, label: statusOf(k).label, color: statusOf(k).color,
                   n: (byStatus[k] || []).length };
        })
    };
  }

  /* ── Firestore ────────────────────────────────────────────────────────── */

  function db() {
    if (global.db) return global.db;
    try { return global.firebase.firestore(); } catch (e) { return null; }
  }

  function orgId() {
    return tenant().orgId ||
           (global.OMEGA_WORKSPACE && global.OMEGA_WORKSPACE.orgId) || '';
  }

  function fetchAll() {
    var d = db(), C = cfg(), org = orgId();
    if (!d || !org) return Promise.resolve([]);
    return d.collection(C.collection).where('orgId', '==', org).get()
      .then(function (snap) {
        var out = [];
        snap.forEach(function (doc) { out.push(normalize(doc.id, doc.data())); });
        return out;
      })['catch'](function (e) {
        /* Say WHICH collection was refused. "Missing or insufficient
           permissions" with no collection name has sent people to the wrong
           rules block more than once. */
        console.error('[omega-delivery] ' + C.collection +
          ' read failed \u2014 deploy firestore-delivery.rules', e);
        return [];
      });
  }

  function create(doc) {
    var d = db(), C = cfg();
    if (!d) return Promise.reject(new Error('No database connection.'));
    var user = null;
    try { user = global.firebase.auth().currentUser; } catch (e) {}
    var stamp = global.firebase.firestore.FieldValue.serverTimestamp();
    var body = {};
    for (var k in doc) if (doc.hasOwnProperty(k)) body[k] = doc[k];
    body.orgId       = orgId();
    body.status      = body.status || 'submitted';
    body.createdBy   = user ? String(user.email || '').toLowerCase() : '';
    body.createdAt   = stamp;
    body.updatedAt   = stamp;
    body.submittedAt = stamp;
    return d.collection(C.collection).add(body);
  }

  function patch(id, body) {
    var d = db(), C = cfg();
    if (!d) return Promise.reject(new Error('No database connection.'));
    body = body || {};
    body.updatedAt = global.firebase.firestore.FieldValue.serverTimestamp();
    return d.collection(C.collection).doc(id).update(body);
  }

  /* Stamp the first reply, once. Write-once matters even on a single-tenant
     book of work: the person being measured on response time should not be
     able to move the number that measures them by touching the record again. */
  function markResponded(r) {
    if (r.firstResponseAt) return Promise.resolve();
    return patch(r.id, {
      firstResponseAt: global.firebase.firestore.FieldValue.serverTimestamp()
    });
  }

  /* Create the editor project for a referral and link the two.

     Stamped with THIS tenant's orgId, unlike the ops console's version which
     stamps the client's. The distinction matters: on the ops console the
     client is another Omega tenant with their own portal to see it in. Here
     the tenant's customer has no Omega account at all, so the project belongs
     to the tenant and the customer's name is carried in `client`. */
  /* A referral's `projectType` is a TECHNOLOGY (what the site is). The New
     Project modal in index.html records the same idea as `siteScopes`, using
     its own key set, and the editor opens its tools from those. Seeding them
     here is what makes a referral pushed from the queue open the same way as
     one created by hand — otherwise the editor starts blank and somebody has
     to re-state a fact the referral already carried.

     Note `siteScopes` and `scopes` are DIFFERENT fields on purpose. `scopes`
     is the deliverables/service lines asked for, which is what the ops
     console reads. Site hardware and requested packages are two vocabularies
     and must not share a field. */
  var SITE_SCOPES_FOR = {
    solar:   ['der'],
    wind:    ['der'],
    bess:    ['bess'],
    hybrid:  ['der', 'bess'],
    compute: ['compute'],
    ev:      ['l2'],
    other:   []
  };

  function createLinkedProject(r) {
    var d = db();
    if (!d) return Promise.reject(new Error('No database connection.'));
    var user = null;
    try { user = global.firebase.auth().currentUser; } catch (e) {}
    var stamp = global.firebase.firestore.FieldValue.serverTimestamp();
    var t = String(r.projectType || '').toLowerCase();
    return d.collection('projects').add({
      orgId:      orgId(),
      uid:        user ? user.uid : null,
      name:       r.projectName || 'Untitled project',
      address:    r.address || '',
      stage:      'candidate',
      scopes:     r.scopes || [],                  // service lines requested
      siteScopes: SITE_SCOPES_FOR[t] || [],        // what the site contains
      type:       (t === 'ev') ? 'EV' : 'BESS',
      client:     r.clientName || '',
      source:     'referral',
      referralId: r.id,
      ownerEmail: user ? String(user.email || '').toLowerCase() : '',
      ownerName:  user ? (user.displayName || user.email || '') : '',
      createdBy:  user ? String(user.email || '').toLowerCase() : '',
      createdAt:  stamp,
      updatedAt:  stamp,
      /* index.html seeds these four on a hand-made project. A project that
         arrives missing them is obviously second-class the moment it opens. */
      elements: [], conduits: [], bessList: [], annotations: []
    }).then(function (ref) {
      return patch(r.id, { editorProjectId: ref.id, status: 'in_production' })
        .then(function () { return ref; })
        ['catch'](function () { return ref; });
    });
  }

  /* ── Sample data ──────────────────────────────────────────────────────── */

  /* Renders ONLY while the collection is empty for this org, and paints a
     ribbon saying so. The first real referral replaces it permanently.

     Deliberately unremarkable: mid-size community solar and C&I storage, a
     couple of jobs late, one blocked on the customer, one never answered.
     A queue where everything is green teaches nobody how to read it. */
  function sampleRows() {
    var now = Date.now(), H = 3600000, D = 86400000;
    function mk(o) {
      o.orgId = orgId();
      return normalize('sample-' + Math.random().toString(36).slice(2, 8), o);
    }
    return [
      mk({ clientName:'Canary Holler Renewables', contactName:'M. Rowe',
           projectName:'Buckland Solar 4.9 MW', projectType:'solar',
           address:'Rockingham County, VA', capacityMw:4.9,
           scopes:['diligence','interconnection','permitting'],
           priority:'standard', status:'in_production',
           submittedAt:new Date(now - 19*D), firstResponseAt:new Date(now - 19*D + 5*H),
           referredBy:'Repeat client' }),
      mk({ clientName:'Green Mountain Power Partners', contactName:'A. Chase',
           projectName:'Barre BESS 20 MWh', projectType:'bess',
           address:'Barre, VT', capacityMw:5, durationHrs:4,
           scopes:['engineering','interconnection','estimating'],
           priority:'rush', status:'accepted',
           submittedAt:new Date(now - 8*D), firstResponseAt:new Date(now - 8*D + 3*H),
           dueDate:new Date(now + 4*D).toISOString().slice(0,10) }),
      mk({ clientName:'Longmeadow Development', contactName:'D. Iyer',
           projectName:'Route 9 Hybrid Campus', projectType:'hybrid',
           address:'Hampden County, MA', capacityMw:12,
           scopes:['diligence','financial'],
           priority:'standard', status:'quoted',
           submittedAt:new Date(now - 5*D), firstResponseAt:new Date(now - 5*D + 21*H) }),
      mk({ clientName:'Bluestem Compute', contactName:'K. Aoki',
           projectName:'Site 7 data center screen', projectType:'compute',
           address:'Story County, IA', capacityMw:38,
           scopes:['siting','diligence'],
           priority:'critical', status:'submitted',
           submittedAt:new Date(now - 31*H), referredBy:'Inbound \u2014 website' }),
      mk({ clientName:'Canary Holler Renewables', contactName:'M. Rowe',
           projectName:'Dinwiddie 2.2 MW re-permit', projectType:'solar',
           address:'Dinwiddie County, VA', capacityMw:2.2,
           scopes:['permitting'],
           priority:'standard', status:'changes_requested',
           submittedAt:new Date(now - 12*D), firstResponseAt:new Date(now - 12*D + 9*H) }),
      mk({ clientName:'Sable Ridge Energy', contactName:'P. Okonkwo',
           projectName:'Sable Ridge substation walk', projectType:'bess',
           address:'Warren County, NJ',
           scopes:['sitereview'],
           priority:'rush', status:'in_review',
           submittedAt:new Date(now - 14*H) }),
      mk({ clientName:'Longmeadow Development', contactName:'D. Iyer',
           projectName:'Chicopee 1.5 MW DDR', projectType:'solar',
           address:'Chicopee, MA', capacityMw:1.5,
           scopes:['diligence'],
           priority:'standard', status:'delivered',
           submittedAt:new Date(now - 40*D), firstResponseAt:new Date(now - 40*D + 6*H),
           completedAt:new Date(now - 21*D) }),
      /* Answered long ago, never stamped — the "unmeasured" case, on purpose. */
      mk({ clientName:'Aurora Grid Co', contactName:'T. Vance',
           projectName:'Aurora III interconnection', projectType:'bess',
           address:'Kane County, IL', capacityMw:9,
           scopes:['interconnection','engineering'],
           priority:'standard', status:'quoted',
           submittedAt:new Date(now - 26*D) })
    ];
  }

  /* ── Dashboard block ──────────────────────────────────────────────────── */

  function injectStyles() {
    if (document.getElementById('cd-styles')) return;
    var s = document.createElement('style');
    s.id = 'cd-styles';
    s.textContent = [
      '#cd-block .cd-ribbon{display:flex;align-items:center;gap:9px;margin:0 0 12px;padding:9px 13px;',
        'border:1px solid #E3C77A;background:#FDF6E3;border-radius:10px;font-size:12.5px;color:#6B551C}',
      '#cd-block .cd-ribbon .cd-tag{background:#8A6D1F;color:#fff;border-radius:5px;padding:2px 7px;',
        'font-size:10px;font-weight:700;letter-spacing:.6px;text-transform:uppercase}',
      '#cd-block .cd-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(132px,1fr));gap:10px;margin-bottom:14px}',
      '#cd-block .cd-kpi{background:#fff;border:1px solid var(--pol-border,#DCE3EA);border-radius:12px;padding:13px 15px}',
      '#cd-block .cd-kpi .l{font-size:10.5px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;',
        'color:var(--sap-ink-2,#6B7A88)}',
      '#cd-block .cd-kpi .v{font-size:23px;font-weight:700;color:var(--sap-num,#12212E);margin-top:5px;',
        'font-variant-numeric:tabular-nums;letter-spacing:-.5px}',
      '#cd-block .cd-kpi .s{font-size:11px;color:var(--sap-ink-2,#6B7A88);margin-top:3px;line-height:1.45}',
      '#cd-block .cd-kpi.bad .v{color:#B3261E}',
      '#cd-block .cd-kpi.warn .v{color:#8A5A00}',
      '#cd-block .cd-cols{display:grid;grid-template-columns:1.25fr 1fr;gap:14px}',
      '#cd-block .cd-card{background:#fff;border:1px solid var(--pol-border,#DCE3EA);border-radius:14px;',
        'padding:18px 20px;box-shadow:var(--pol-shadow,0 1px 3px rgba(20,40,60,.06))}',
      '#cd-block .cd-card-h{font-size:13px;font-weight:700;color:var(--sap-num,#12212E);margin-bottom:2px}',
      '#cd-block .cd-card-s{font-size:11px;color:var(--sap-ink-2,#6B7A88);margin-bottom:14px;line-height:1.5}',
      /* service rows */
      '#cd-block .svc{display:flex;align-items:center;gap:10px;padding:9px 0;border-top:1px solid #EDF1F5}',
      '#cd-block .svc:first-child{border-top:0}',
      '#cd-block .svc .nm{flex:1;min-width:0;font-size:12.5px;color:var(--sap-num,#12212E);font-weight:600}',
      '#cd-block .svc .nm small{display:block;font-weight:400;color:var(--sap-ink-2,#6B7A88);font-size:11px;',
        'margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '#cd-block .svc .bar{width:104px;height:7px;background:#EDF1F5;border-radius:4px;overflow:hidden;flex:0 0 auto}',
      '#cd-block .svc .bar i{display:block;height:100%;background:var(--sap-blue,#0070F2);border-radius:4px}',
      '#cd-block .svc .n{width:28px;text-align:right;font-weight:700;font-variant-numeric:tabular-nums;',
        'color:var(--sap-num,#12212E);font-size:13px;flex:0 0 auto}',
      '#cd-block .svc .flag{font-size:10.5px;font-weight:700;padding:2px 7px;border-radius:20px;flex:0 0 auto}',
      '#cd-block .svc .flag.late{background:#FDECEA;color:#B3261E}',
      '#cd-block .svc .flag.wait{background:#E7F0FD;color:#0B4FA8}',
      '#cd-block .svc .flag.idle{background:#F0F2F5;color:#8A96A2}',
      /* funnel */
      '#cd-block .fun{display:flex;flex-direction:column;gap:9px}',
      '#cd-block .fun-row{display:flex;align-items:center;gap:10px;font-size:12px;color:var(--sap-ink,#3E4C59)}',
      '#cd-block .fun-row .fl{width:104px;flex:0 0 auto}',
      '#cd-block .fun-bar{flex:1;height:7px;background:#EDF1F5;border-radius:4px;overflow:hidden}',
      '#cd-block .fun-bar i{display:block;height:100%;border-radius:4px}',
      '#cd-block .fun-n{width:26px;text-align:right;font-weight:700;color:var(--sap-num,#12212E);',
        'font-variant-numeric:tabular-nums}',
      /* table */
      '#cd-block .cd-tbl{width:100%;border-collapse:collapse;font-size:12.5px}',
      '#cd-block .cd-tbl th{text-align:left;font-size:10.5px;font-weight:700;letter-spacing:.5px;',
        'text-transform:uppercase;color:var(--sap-ink-2,#6B7A88);padding:0 12px 9px 0;white-space:nowrap}',
      '#cd-block .cd-tbl td{padding:10px 12px 10px 0;border-top:1px solid #EDF1F5;color:var(--sap-ink,#3E4C59);',
        'vertical-align:top}',
      '#cd-block .cd-tbl td.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}',
      '#cd-block .cd-tbl td.nm{font-weight:600;color:var(--sap-num,#12212E)}',
      '#cd-block .cd-tbl td.nm small{display:block;font-weight:400;color:var(--sap-ink-2,#6B7A88);font-size:11px;margin-top:2px}',
      '#cd-block .cd-tbl tr:hover td{background:#F7FAFC}',
      '#cd-block .chip{display:inline-block;padding:2px 8px;border-radius:20px;font-size:10.5px;font-weight:700;white-space:nowrap}',
      '#cd-block .clock{font-weight:700;font-variant-numeric:tabular-nums}',
      '#cd-block .clock.ok{color:#1D7A3E}',
      '#cd-block .clock.warn{color:#8A5A00}',
      '#cd-block .clock.bad{color:#B3261E}',
      '#cd-block .clock.none{color:#8A96A2;font-weight:400}',
      '#cd-block .cd-act{display:flex;gap:9px;flex-wrap:wrap;margin-bottom:14px}',
      '#cd-block .cd-btn{display:inline-block;border-radius:8px;padding:8px 14px;font-size:12.5px;',
        'font-weight:600;text-decoration:none;cursor:pointer;border:1px solid var(--pol-border,#DCE3EA);',
        'background:#fff;color:var(--sap-ink,#3E4C59)}',
      '#cd-block .cd-btn.pri{background:var(--sap-blue,#0070F2);border-color:var(--sap-blue,#0070F2);color:#fff}',
      '#cd-block .cd-btn:hover{border-color:var(--sap-blue,#0070F2)}',
      '#cd-block .cd-foot{font-size:11px;color:var(--sap-ink-2,#6B7A88);margin-top:12px;line-height:1.55}',
      '#cd-block .cd-empty{padding:26px 20px;text-align:center;color:var(--sap-ink-2,#6B7A88);font-size:13px;line-height:1.65}',
      '@media(max-width:1100px){#cd-block .cd-cols{grid-template-columns:1fr}}',
      '@media(max-width:760px){#cd-block .cd-scroll{overflow-x:auto}#cd-block .cd-tbl{min-width:660px}}'
    ].join('');
    document.head.appendChild(s);
  }

  function clockCell(r) {
    var s = r.sla;
    if (s.measured) return '<span class="clock ' + s.state + '">' + fmtHours(s.responseH) + '</span>';
    if (s.unmeasured) return '<span class="clock none" title="Answered before the clock existed, or answered without a stamp">\u2014</span>';
    return '<span class="clock ' + s.state + '">' + fmtHours(s.elapsedH) + '</span>';
  }

  function kpiCards(a) {
    var k = a.kpi;
    var cards = [
      { l: 'Open jobs',     v: k.open,     s: 'Referred through in production' },
      { l: 'Awaiting reply',v: k.waiting,  s: k.breached ? k.breached + ' past target' : 'All inside target',
        cls: k.breached ? 'bad' : (k.waiting ? 'warn' : '') },
      { l: 'Median reply',  v: fmtHours(k.medianReply),
        s: k.unmeasured ? k.unmeasured + ' answered, unmeasured' : 'First response' },
      { l: 'Late',          v: k.late,     s: 'Past due date', cls: k.late ? 'bad' : '' },
      { l: 'In production', v: k.inProduction, s: k.linked + ' linked to the editor' },
      { l: 'Delivered',     v: k.delivered, s: 'Packages issued' }
    ];
    return '<div class="cd-kpis">' + cards.map(function (c) {
      return '<div class="cd-kpi ' + (c.cls || '') + '">' +
             '<div class="l">' + esc(c.l) + '</div>' +
             '<div class="v">' + esc(String(c.v)) + '</div>' +
             '<div class="s">' + esc(c.s) + '</div></div>';
    }).join('') + '</div>';
  }

  function serviceCard(a) {
    var max = 1;
    a.byService.forEach(function (s) { if (s.open.length > max) max = s.open.length; });

    var rows = a.byService.map(function (s) {
      var flag = s.late    ? '<span class="flag late">' + s.late + ' late</span>'
               : s.waiting ? '<span class="flag wait">' + s.waiting + ' new</span>'
               : !s.open.length ? '<span class="flag idle">idle</span>' : '';
      return '<div class="svc">' +
        '<div class="nm">' + esc(s.label) +
          (s.desc ? '<small>' + esc(s.desc) + '</small>' : '') + '</div>' +
        flag +
        '<span class="bar"><i style="width:' + Math.round(s.open.length / max * 100) + '%"></i></span>' +
        '<span class="n">' + s.open.length + '</span></div>';
    }).join('');

    var untag = a.untagged.length
      ? '<div class="cd-foot"><b>' + a.untagged.length + '</b> referral' +
        (a.untagged.length === 1 ? '' : 's') + ' carry no service line. That is an ' +
        'unanswered question about what was asked for, not a job of zero size \u2014 ' +
        'they are listed in the queue under <i>Needs scoping</i>.</div>'
      : '';

    return '<div class="cd-card">' +
      '<div class="cd-card-h">Open work by service line</div>' +
      '<div class="cd-card-s">Counted once per service line, so the total runs ' +
        'ahead of the referral count \u2014 one site can carry four.</div>' +
      rows + untag + '</div>';
  }

  function funnelCard(a) {
    var max = 1;
    a.funnel.forEach(function (f) { if (f.n > max) max = f.n; });
    return '<div class="cd-card">' +
      '<div class="cd-card-h">Pipeline</div>' +
      '<div class="cd-card-s">Where every live referral currently sits.</div>' +
      '<div class="fun">' + a.funnel.map(function (f) {
        return '<div class="fun-row"><span class="fl">' + esc(f.label) + '</span>' +
          '<span class="fun-bar"><i style="width:' + Math.round(f.n / max * 100) +
          '%;background:' + f.color + '"></i></span>' +
          '<span class="fun-n">' + f.n + '</span></div>';
      }).join('') + '</div></div>';
  }

  function queueTable(a) {
    var C = cfg();
    /* Oldest unanswered first — the list is a worklist, not a log. */
    var rows = a.live.filter(function (r) {
      return r.status !== 'delivered' && r.status !== 'declined';
    }).sort(function (x, y) {
      if (x.sla.answered !== y.sla.answered) return x.sla.answered ? 1 : -1;
      return (y.sla.pct || 0) - (x.sla.pct || 0);
    }).slice(0, 8);

    if (!rows.length) {
      return '<div class="cd-card"><div class="cd-empty">' +
        'Nothing in the queue. Log a referral to start.</div></div>';
    }

    return '<div class="cd-card"><div class="cd-card-h">Queue</div>' +
      '<div class="cd-card-s">Longest wait first. Answered jobs sort after ' +
      'unanswered ones regardless of age.</div><div class="cd-scroll"><table class="cd-tbl">' +
      '<thead><tr><th>Project</th><th>Service lines</th><th>Status</th>' +
      '<th class="n">Reply</th><th class="n">Due</th></tr></thead><tbody>' +
      rows.map(function (r) {
        var st = statusOf(r.status);
        var svc = r.scopes.length
          ? r.scopes.map(function (k) { return serviceOf(k).label; }).join(', ')
          : '<i>needs scoping</i>';
        var due = r.due
          ? '<span' + (r.due.late ? ' style="color:#B3261E;font-weight:700"' : '') + '>' +
            fmtDate(r.due.at) + (r.due.derived ? '*' : '') + '</span>'
          : '\u2014';
        return '<tr><td class="nm">' + esc(r.projectName) +
          '<small>' + esc(r.clientName || 'No customer named') +
          (r.capacityMw ? ' \u00b7 ' + r.capacityMw + ' MW' : '') + '</small></td>' +
          '<td>' + svc + '</td>' +
          '<td><span class="chip" style="background:' + st.color + '1A;color:' + st.color + '">' +
            esc(st.label) + '</span></td>' +
          '<td class="n">' + clockCell(r) + '</td>' +
          '<td class="n">' + due + '</td></tr>';
      }).join('') +
      '</tbody></table></div>' +
      '<div class="cd-foot">Dates marked * are derived from priority, not set by ' +
      'the customer. Reply time is FIRST response, not delivery \u2014 and it is not ' +
      'retroactive, so referrals logged before this shipped read \u2014 forever.' +
      (a.kpi.unmeasured ? ' ' + a.kpi.unmeasured + ' record' +
        (a.kpi.unmeasured === 1 ? ' was' : 's were') + ' clearly answered but never ' +
        'stamped; counting those as zero would flatter the median.' : '') +
      '</div></div>';
  }

  function render(a, sample) {
    var C = cfg();
    var host = document.getElementById('cd-block');
    if (!host) return;

    /* render() is exposed for console use and is called directly by the
       queue page's preview path, so it cannot rely on mount() having run.
       injectStyles is idempotent. */
    injectStyles();

    var head =
      '<div class="block-head"><div>' +
      '<div class="block-title">' + esc(C.title) + '</div>' +
      '<div class="block-sub">' + esc(C.subtitle) + '</div>' +
      '</div></div>';

    var ribbon = sample
      ? '<div class="cd-ribbon"><span class="cd-tag">Sample</span>' +
        '<span>Illustrative referrals, shown only while your queue is empty. ' +
        'The first real referral replaces this permanently.</span></div>'
      : '';

    var actions =
      '<div class="cd-act">' +
      '<a class="cd-btn pri" href="' + esc(C.intakeHref) + '">Log a referral</a>' +
      '<a class="cd-btn" href="' + esc(C.queueHref) + '">Open the full queue</a>' +
      '<a class="cd-btn" href="/projects.html">Projects in the editor</a>' +
      '</div>';

    host.innerHTML = head + ribbon + actions + kpiCards(a) +
      '<div class="cd-cols">' + serviceCard(a) + funnelCard(a) + '</div>' +
      '<div style="margin-top:14px">' + queueTable(a) + '</div>';
  }

  /* ── Mount ────────────────────────────────────────────────────────────── */

  function mount() {
    var C = cfg();
    if (!C.enabled || MOUNTED) return false;
    var hostRoot = document.getElementById('dev-fixed');
    if (!hostRoot) return false;

    injectStyles();
    var block = document.createElement('div');
    block.className = 'dash-block';
    block.id = 'cd-block';
    block.setAttribute('data-block', BLOCK_KEY);

    var anchor = hostRoot.querySelector('.dash-block[data-block="' + C.insertAfter + '"]');
    if (anchor && anchor.nextSibling) hostRoot.insertBefore(block, anchor.nextSibling);
    else if (anchor) hostRoot.appendChild(block);
    else hostRoot.insertBefore(block, hostRoot.firstChild);

    MOUNTED = true;
    refresh();
    return true;
  }

  function refresh() {
    if (!MOUNTED) return Promise.resolve();
    var C = cfg();
    return fetchAll().then(function (rows) {
      var sample = false;
      if (!rows.length && C.sampleData) { rows = sampleRows(); sample = true; }
      render(analyse(rows), sample);
    })['catch'](function (e) {
      console.error('[omega-delivery] refresh failed', e);
      render(analyse([]), false);
    });
  }

  /* Ride along with the dashboard's own recompute rather than polling. */
  function hookRollup() {
    if (typeof global.computeLiveRollup !== 'function' || global.computeLiveRollup.__cd) return;
    var orig = global.computeLiveRollup;
    var wrapped = function () {
      var r = orig.apply(this, arguments);
      try { refresh(); } catch (e) {}
      return r;
    };
    wrapped.__cd = true;
    global.computeLiveRollup = wrapped;
  }

  /* index.html defines its dashboard functions in an inline script further
     down the page, and OMEGA_WORKSPACE only exists after auth resolves. Poll
     briefly for both rather than assuming script order. */
  var tries = 0;
  function boot() {
    if (!cfg().enabled) return;
    if (tries++ > 150) return;                        // ~60s, then give up quietly
    hookRollup();
    if (global.OMEGA_WORKSPACE && document.getElementById('dev-fixed')) {
      if (mount()) return;
    }
    setTimeout(boot, 400);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  /* Exposed for the queue and intake pages, and for the console:
       OmegaDelivery.render(OmegaDelivery.analyse(rows)) */
  global.OmegaDelivery = {
    STATUS: STATUS, TYPES: TYPES, PRIORITY: PRIORITY,
    statusOf: statusOf, typeOf: typeOf, serviceOf: serviceOf, priorityOf: priorityOf,
    services: function () { return cfg().services; },
    cfg: cfg, esc: esc, toDate: toDate, fmtDate: fmtDate, fmtHours: fmtHours,
    normalize: normalize, analyse: analyse, slaOf: slaOf, dueOf: dueOf,
    fetchAll: fetchAll, create: create, patch: patch,
    markResponded: markResponded, createLinkedProject: createLinkedProject,
    sampleRows: sampleRows, refresh: refresh, render: render, orgId: orgId
  };

})(typeof window !== 'undefined' ? window : this);
