/* ═══════════════════════════════════════════════════════════════════════════
   GET|POST /api/sales — ClearSky's sales database: the dashboard, the
   prospects, the activity log, the do-not-contact list and the agent's switch
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   WHO. A verified @clearsky-usa.com person (JARVIS's Sales view, the
   console), or ClearSky's machine key (the Claude Code sales agent,
   scripts/sales-cli.js, JARVIS's bin/sales) with sales:read / sales:write on
   an ADMIN key (api/_lib/agent-auth.js staffOrAgent). A tenant never reads
   this: it is our book, not theirs.

   READ
     GET /api/sales                      the dashboard (funnel, approvals,
                                         inbound, outreach, LinkedIn, today,
                                         what to change) — api/_lib/sales.js
     GET /api/sales?view=agent           the morning packet the agent works
                                         from: today, the demo requests with
                                         their words, prospects due, what was
                                         already drafted today, the rules
     GET /api/sales?view=prospects&stage=&vertical=&state=&q=&limit=
     GET /api/sales?prospect=<id>        one prospect and its activity
     GET /api/sales?view=activity&kind=&limit=
     GET /api/sales?view=candidates&status=new&limit=   the research queue
     GET /api/sales?view=suppressions

   WRITE (POST { action, ... })
     upsert-prospects  { prospects:[...] }         additive merge, ≤200 a call
     upsert-candidates { candidates:[...] }        harvested names, ≤500 a call
     resolve-candidate { key, prospect | skip }    researched into a prospect, or skipped
     log               { entries:[{kind,...}] }    idempotent by entry id
     stage             { prospectId, stage, note } forward only for the agent
     suppress          { email | domain, reason }  nothing ever removes it
     screen            { emails:[...] }            may the agent write to these?
     lint-post         { text, campaign }          a LinkedIn post, checked and tagged
     config            { enabled, sender, ... }    a PERSON only, never the key

   WHAT IT NEVER DOES. Send mail, post anywhere, approve a signup, price
   anything, or touch a tenant record. The agent drafts in Gmail and a person
   sends; approval stays on the master console; prices stay in the book.
   Everything here is Admin SDK only in firestore.rules (sales_*).
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var A = require('./_lib/admin');
var K = require('./_lib/agent-auth');
var S = require('./_lib/sales');
var G = require('./_lib/growth');
var B = require('./_lib/growth-board');
var O = require('./_lib/office-roster');

var MAX_PROSPECTS = 5000, MAX_ACTIVITY = 1000, MAX_SUPPRESSED = 5000;
var MAX_UPSERT = 200, MAX_LOG = 100, MAX_SCREEN = 200, MAX_CANDIDATES = 500;
var DEFAULT_DRAFT_CAP = 25;
var DAY = 86400000;

function soft(p, fallback) { return p.then(function (s) { return s; }, function () { return fallback; }); }
var EMPTY = { docs: [], size: 0, forEach: function () {} };
function rows(snap) { var out = []; (snap || EMPTY).forEach(function (d) { var x = d.data() || {}; x.id = d.id; out.push(x); }); return out; }
function iso(ms) { return new Date(ms).toISOString(); }
function today(now) { return iso(now).slice(0, 10); }
function safeId(v) { var s = String(v == null ? '' : v).trim(); return /^[A-Za-z0-9][A-Za-z0-9_.:@-]{0,119}$/.test(s) && s.indexOf('..') < 0 ? s : ''; }
function prospectRef(db, id) {
  /* a prospect id is a domain or an email address: never a path */
  if (!id || /[\/]/.test(id) || id.length > 254 || /^__.*__$/.test(id)) throw A.httpError(400, 'bad prospect id');
  return db.collection('sales_prospects').doc(id);
}

function loadConfig(db) { return soft(db.collection('sales_config').doc('current').get(), { exists: false }).then(function (s) { return s.exists ? (s.data() || {}) : {}; }); }
function loadSuppressed(db) {
  return soft(db.collection('sales_suppressions').limit(MAX_SUPPRESSED).get(), EMPTY).then(function (snap) {
    var map = {}, n = 0; snap.forEach(function (d) { map[d.id] = 1; n++; }); return { map: map, count: n };
  });
}
function loadProspects(db) { return soft(db.collection('sales_prospects').orderBy('updatedAt', 'desc').limit(MAX_PROSPECTS).get(), EMPTY).then(rows); }
function loadActivity(db, n) { return soft(db.collection('sales_activity').orderBy('at', 'desc').limit(n || MAX_ACTIVITY).get(), EMPTY).then(rows); }

/* how many candidates wait for research: an aggregate count where the SDK
   has one, else a capped read (the double, an old SDK) */
function countOf(q, cap) {
  if (typeof q.count === 'function') return soft(q.count().get().then(function (s) { return s.data().count; }), null);
  return soft(q.limit(cap).get().then(function (s) { return s.size; }), null);
}
function candidateCounts(db) {
  var c = db.collection('sales_candidates');
  return Promise.all(['new', 'enriched', 'skipped'].map(function (st) { return countOf(c.where('status', '==', st), MAX_PROSPECTS); }))
    .then(function (r) { return { new: r[0], enriched: r[1], skipped: r[2] }; });
}

function screenCtx(cfg, sup, inbound) { return { suppressed: sup.map, offLimits: Array.isArray(cfg.offLimits) ? cfg.offLimits : [], inbound: !!inbound }; }

/* ── the dashboard ── */
function dashboard(db, now) {
  return Promise.all([B.records(db), loadProspects(db), loadActivity(db), loadConfig(db), loadSuppressed(db), candidateCounts(db)]).then(function (r) {
    var records = r[0];
    var d = S.dashboard({
      board: G.board(records, now),
      orgs: records.map(function (x) { return { orgId: x.orgId, name: x.name, createdAt: x.createdAt, approvedAt: x.approvedAt, status: x.status, selfServe: x.selfServe }; }),
      prospects: r[1], activity: r[2], config: r[3], suppressed: r[4].count
    }, now);
    d.candidates = r[5];
    d.caps = { prospects: MAX_PROSPECTS, activity: MAX_ACTIVITY, capped: r[1].length >= MAX_PROSPECTS || r[2].length >= MAX_ACTIVITY };
    return { d: d, records: records, prospects: r[1], activity: r[2], config: r[3], suppressed: r[4] };
  });
}

/* the agent's morning packet: the dashboard plus the words it needs to
   draft (a demo request's message), the rows due, and what it already did
   today, so a retry drafts nothing twice */
function agentPacket(db, now) {
  return dashboard(db, now).then(function (x) {
    var d = x.d, start = today(now) + 'T00:00:00.000Z';
    var demoById = {};
    x.activity.forEach(function (a) { if (a.kind === 'demo-request') demoById[a.id] = a; });
    var cfg = x.config;
    return {
      asOf: d.asOf,
      rules: {
        enabled: cfg.enabled === true,
        sender: cfg.sender || null, senderName: cfg.senderName || null, postalAddress: cfg.postalAddress || null,
        coldEmailAllowed: !!(cfg.sender && cfg.postalAddress),
        dailyDraftCap: Number(cfg.dailyDraftCap) || DEFAULT_DRAFT_CAP,
        demoLink: cfg.demoLink || null,
        linkedinChannel: cfg.linkedinChannel || 'gmail-drafts',
        offLimits: S.OFF_LIMITS_FLOOR.concat(Array.isArray(cfg.offLimits) ? cfg.offLimits : []),
        never: ['send mail or post anywhere (drafts only; a person sends)', 'approve, reject or change a signup, tenant, billing or price',
          'quote a price or link the price list on LinkedIn', 'describe a coming-soon feature as shipping', 'write to anyone screen() refuses']
      },
      today: d.today,
      approvals: d.approvals.pending,
      demoRequests: d.inbound.unanswered.map(function (u) {
        var a = demoById[u.id] || {};
        return { id: u.id, prospectId: u.prospectId, name: u.name, email: u.email, company: u.company, interest: u.interest,
          vertical: a.vertical || '', message: a.message || '', at: u.at, businessDays: u.businessDays, source: u.source };
      }),
      accounts: (G.board(x.records, now).tenants || []).filter(function (t) { return t.priority >= 2 && t.lifecycle !== 'pending'; }),
      prospectsDue: x.prospects.filter(function (p) { return S.OPEN.indexOf(p.stage) >= 0 && p.next && p.next.due && p.next.due <= today(now); })
        .sort(function (a, b) { return (b.score || 0) - (a.score || 0); }).slice(0, 25),
      alreadyToday: x.activity.filter(function (a) { return String(a.at || '') >= start && ['email-drafted', 'linkedin-drafted', 'approval-nudge', 'agent-run'].indexOf(a.kind) >= 0; })
        .map(function (a) { return { id: a.id, kind: a.kind, prospectId: a.prospectId || null, orgId: a.orgId || null, ref: a.ref || null, summary: a.summary || '' }; }),
      candidates: d.candidates,
      linkedin: d.linkedin, suggestions: d.suggestions, funnel: d.funnel
    };
  });
}

/* ── writes ── */
function upsertProspects(db, caller, b, now) {
  var list = Array.isArray(b.prospects) ? b.prospects : [];
  if (!list.length) throw A.httpError(400, 'prospects[] required');
  if (list.length > MAX_UPSERT) throw A.httpError(400, 'at most ' + MAX_UPSERT + ' prospects a call');
  var staff = caller.staff === true;
  var errors = [], cleaned = [], seen = {};
  list.forEach(function (p, i) {
    var c = S.cleanProspect(p);
    if (!c.ok) { errors.push({ index: i, error: c.error }); return; }
    if (seen[c.prospect.id] != null) { errors.push({ index: i, error: 'duplicate of index ' + seen[c.prospect.id] + ' in this call (' + c.prospect.id + ')' }); return; }
    seen[c.prospect.id] = i;
    if (!c.prospect.source) c.prospect.source = { kind: caller.agent ? 'agent' : 'staff', ref: caller.by };
    cleaned.push(c.prospect);
  });
  return Promise.all(cleaned.map(function (p) { return prospectRef(db, p.id).get(); })).then(function (snaps) {
    var batch = db.batch(), created = [], updated = [];
    snaps.forEach(function (s, i) {
      var inc = cleaned[i];
      var merged = S.mergeProspect(s.exists ? (s.data() || {}) : null, inc, now, { overwrite: staff && b.overwrite === true, allowBack: staff && b.allowBack === true });
      if (!s.exists) { merged.createdBy = caller.by; created.push(inc.id); } else updated.push(inc.id);
      merged.updatedBy = caller.by;
      batch.set(s.ref || prospectRef(db, inc.id), merged);
    });
    if (cleaned.length) {
      batch.set(db.collection('sales_activity').doc(), { kind: 'research', at: iso(now), by: caller.by,
        summary: 'Filed ' + created.length + ' new, updated ' + updated.length + (b.label ? ' (' + S.clean(b.label, 80) + ')' : ''),
        count: cleaned.length });
    }
    return batch.commit().then(function () { return { ok: true, created: created, updated: updated, errors: errors }; });
  });
}

/* the stage a touch implies, when it moves one forward */
var TOUCH_STAGE = { 'email-sent': 'contacted', 'reply': 'contacted', 'call': 'contacted', 'meeting': 'demo', 'proposal-sent': 'proposal' };
var TOUCHES = ['email-drafted', 'email-sent', 'reply', 'call', 'meeting', 'proposal-sent', 'demo-request'];

function logEntries(db, caller, b, now) {
  var list = Array.isArray(b.entries) ? b.entries : (b.entry ? [b.entry] : []);
  if (!list.length) throw A.httpError(400, 'entries[] required');
  if (list.length > MAX_LOG) throw A.httpError(400, 'at most ' + MAX_LOG + ' entries a call');
  return Promise.all([loadConfig(db), loadSuppressed(db)]).then(function (ctx) {
    var cfg = ctx[0], sup = ctx[1], results = [];
    var cap = Number(cfg.dailyDraftCap) || DEFAULT_DRAFT_CAP, accepted = 0;
    var capRef = db.collection('sales_counters').doc('drafts-' + today(now));
    /* the daily draft cap binds the AGENT (a person logging their own work
       is not capped) and counts drafts actually filed: a refused entry or a
       retry of one already filed spends nothing */
    var capRead = caller.agent ? soft(capRef.get(), { exists: false }).then(function (s) { return s.exists ? Number((s.data() || {}).n || 0) : 0; }) : Promise.resolve(0);
    return capRead.then(function (used) {
      return list.reduce(function (p, e, i) {
        return p.then(function () {
          e = e || {};
          var kind = String(e.kind || '');
          if (!S.KINDS[kind]) { results.push({ index: i, ok: false, error: 'unknown kind: ' + kind }); return; }
          if (kind === 'email-drafted' && caller.agent && used + accepted >= cap) { results.push({ index: i, ok: false, error: 'the daily draft cap (' + cap + ') is reached' }); return; }
          if (kind === 'demo-request' && !caller.staff) { results.push({ index: i, ok: false, error: 'demo requests arrive through the website form' }); return; }
          var to = S.normEmail(e.to || e.email);
          var outbound = (kind === 'email-drafted' || kind === 'email-sent') && caller.agent;
          if (outbound) {
            if (!to) { results.push({ index: i, ok: false, error: 'an email entry needs `to`' }); return; }
            var sc = S.screen(to, screenCtx(cfg, sup, true));
            if (!sc.ok) { results.push({ index: i, ok: false, error: 'refused: ' + sc.reason }); return; }
          }
          return (outbound ? warmth(db, to) : Promise.resolve({ inbound: true, customer: true })).then(function (w) {
            /* the same CAN-SPAM line as `screen`: a draft to someone who
               never wrote to us and is not a customer needs a monitored
               sender and a postal address. "Wrote to us" and "customer" are
               READ from the records, never taken from the entry's word. */
            if (outbound && !w.inbound && !w.customer) {
              if (S.isPublicDomain(to.split('@')[1])) { results.push({ index: i, ok: false, error: 'refused: a public mailbox that never wrote to us' }); return; }
              if (!(cfg.sender && cfg.postalAddress)) { results.push({ index: i, ok: false, error: 'refused: cold email is blocked until sales_config has a sender and a postal address' }); return; }
            }
            return record(e, kind, to, i);
          });
        });
      }, Promise.resolve()).then(function () {
        if (!accepted) return;
        return db.runTransaction(function (tx) {
          return tx.get(capRef).then(function (s) {
            var n = s.exists ? Number((s.data() || {}).n || 0) : 0;
            tx.set(capRef, { n: n + accepted, day: today(now), updatedAt: iso(now) }, { merge: true });
          });
        });
      }).then(function () { return { ok: results.every(function (r) { return r.ok; }), results: results }; });
    });

    function record(e, kind, to, i) {
      var at = S.millis(e.at); if (at == null || at > now + 3600000 || at < now - 90 * DAY) at = now;
      var pid = e.prospectId ? String(e.prospectId).toLowerCase() : S.prospectIdFor({ domain: e.domain, email: to });
      var doc = { kind: kind, at: iso(at), by: caller.by, summary: S.clean(e.summary, 300) };
      if (pid) doc.prospectId = pid;
      var org = A.safeOrg(e.orgId || ''); if (org) doc.orgId = org;
      if (to) doc.to = to;
      ['ref', 'url', 'campaign', 'subject'].forEach(function (k) { var v = S.clean(e[k], k === 'url' ? 300 : 160); if (v) doc[k] = v; });
      if (e.stats && typeof e.stats === 'object') {
        var st = {}; ['impressions', 'reactions', 'comments', 'reposts', 'clicks', 'followers'].forEach(function (k) { var n = Number(e.stats[k]); if (isFinite(n) && n >= 0) st[k] = Math.round(n); });
        doc.stats = st;
      }
      var id = safeId(e.id);
      var ref = id ? db.collection('sales_activity').doc(id) : db.collection('sales_activity').doc();
      var write = id ? ref.get().then(function (s) { if (s.exists) return 'existed'; return ref.set(doc).then(function () { return 'created'; }); })
                     : ref.set(doc).then(function () { return 'created'; });
      return write.then(function (state) {
        results.push({ index: i, ok: true, id: ref.id, state: state });
        if (state === 'created' && kind === 'email-drafted' && caller.agent) accepted++;
        if (state !== 'created' || !pid || TOUCHES.indexOf(kind) < 0) return;
        /* a touch dates the prospect and moves it forward on an explicit
           signal; a missing row is filed so the touch is never orphaned */
        var pref = prospectRef(db, pid);
        return pref.get().then(function (s) {
          var cur = s.exists ? (s.data() || {}) : null;
          var base = cur || S.mergeProspect(null, { id: pid, domain: pid.indexOf('@') < 0 ? pid : '', contacts: to ? [{ email: to }] : [], evidence: [], tags: [], source: { kind: 'activity', ref: kind } }, now);
          var next = {}; Object.keys(base).forEach(function (k) { next[k] = base[k]; });
          next.lastTouchAt = iso(at); next.updatedAt = iso(now); next.updatedBy = caller.by;
          if (TOUCH_STAGE[kind]) next.stage = S.forward(base.stage, TOUCH_STAGE[kind]);
          next.score = S.score(next, now);
          if (!cur) next.createdBy = caller.by;
          return pref.set(next);
        });
      });
    }
  });
}

/* Has this address's company written to us (an inbound prospect: the demo
   form), or is it a workspace on the platform (a customer)? Read, not told. */
function warmth(db, to) {
  var dom = to.split('@')[1], pid = S.prospectIdFor({ email: to }), org = A.safeOrg(dom);
  return Promise.all([
    soft(db.collection('sales_prospects').doc(pid).get(), { exists: false }),
    org && !S.isPublicDomain(dom) ? soft(db.collection('omega_orgs').doc(org).get(), { exists: false }) : Promise.resolve({ exists: false })
  ]).then(function (r) {
    return { inbound: !!(r[0].exists && (r[0].data() || {}).inbound === true), customer: !!r[1].exists };
  });
}

function setStage(db, caller, b, now) {
  var id = String(b.prospectId || '').toLowerCase(), stage = String(b.stage || '');
  if (S.STAGES.indexOf(stage) < 0) throw A.httpError(400, 'stage must be one of ' + S.STAGES.join(', '));
  var ref = prospectRef(db, id);
  return ref.get().then(function (s) {
    if (!s.exists) throw A.httpError(404, 'no such prospect');
    var p = s.data() || {}, was = p.stage || 'target', to;
    if (caller.staff) to = stage;
    else {
      /* the twin's rule: a stage moves forward on an explicit signal, and
         never backwards, won or lost without a person */
      if (stage === 'won' || stage === 'lost') throw A.httpError(403, 'won and lost are a person\'s call');
      to = S.forward(was, stage);
      if (to === was && stage !== was) throw A.httpError(409, 'the agent moves a stage forward only (' + was + ' → ' + stage + ' refused)');
    }
    p.stage = to; p.updatedAt = iso(now); p.updatedBy = caller.by; p.score = S.score(p, now);
    var batch = db.batch();
    batch.set(ref, p);
    batch.set(db.collection('sales_activity').doc(), { kind: 'stage', at: iso(now), by: caller.by, prospectId: id, summary: was + ' → ' + to + (b.note ? ': ' + S.clean(b.note, 200) : '') });
    return batch.commit().then(function () { return { ok: true, prospectId: id, was: was, stage: to }; });
  });
}

function suppress(db, caller, b, now) {
  var email = S.normEmail(b.email), dom = S.normDomain(b.domain);
  var key = email || (dom ? '*@' + dom : '');
  if (!key) throw A.httpError(400, 'an email or a domain is required');
  var ref = db.collection('sales_suppressions').doc(key);
  return ref.get().then(function (s) {
    if (s.exists) return { ok: true, key: key, existed: true };
    var batch = db.batch();
    batch.set(ref, { reason: S.clean(b.reason, 200) || 'asked not to be contacted', by: caller.by, at: iso(now) });
    batch.set(db.collection('sales_activity').doc(), { kind: 'suppressed', at: iso(now), by: caller.by, prospectId: S.prospectIdFor({ domain: dom, email: email }) || null, summary: 'Do not contact: ' + key + (b.reason ? ' (' + S.clean(b.reason, 120) + ')' : '') });
    return batch.commit().then(function () { return { ok: true, key: key, existed: false }; });
  });
}

/* names from a harvest: filed as candidates, merged by companyKey, never
   written to until the agent has found the company's website */
function upsertCandidates(db, caller, b, now) {
  var list = Array.isArray(b.candidates) ? b.candidates : [];
  if (!list.length) throw A.httpError(400, 'candidates[] required');
  if (list.length > MAX_CANDIDATES) throw A.httpError(400, 'at most ' + MAX_CANDIDATES + ' candidates a call');
  var errors = [], byKey = {};
  list.forEach(function (c, i) {
    var r = S.cleanCandidate(c);
    if (!r.ok) { errors.push({ index: i, error: r.error }); return; }
    var k = r.candidate.key;
    /* two spellings in one harvest are one company: add their counts */
    if (byKey[k]) { byKey[k].projects += r.candidate.projects; byKey[k].evidence = byKey[k].evidence.concat(r.candidate.evidence).slice(0, 10); return; }
    byKey[k] = r.candidate;
  });
  var keys = Object.keys(byKey);
  return Promise.all(keys.map(function (k) { return db.collection('sales_candidates').doc(k).get(); })).then(function (snaps) {
    var batch = db.batch(), created = 0, updated = 0;
    snaps.forEach(function (s, i) {
      var merged = S.mergeCandidate(s.exists ? (s.data() || {}) : null, byKey[keys[i]], now);
      if (s.exists) updated++; else { created++; merged.createdBy = caller.by; }
      batch.set(db.collection('sales_candidates').doc(keys[i]), merged);
    });
    if (keys.length) batch.set(db.collection('sales_activity').doc(), { kind: 'research', at: iso(now), by: caller.by, count: keys.length,
      summary: 'Harvested ' + keys.length + ' names (' + created + ' new)' + (b.label ? ' from ' + S.clean(b.label, 80) : '') });
    return batch.commit().then(function () { return { ok: true, created: created, updated: updated, errors: errors }; });
  });
}

/* the agent found the website (the candidate becomes a prospect, its
   evidence carried over) or decided it is not ours to chase (skipped, with
   the reason); either way it leaves the research queue */
function resolveCandidate(db, caller, b, now) {
  var key = S.companyKey(b.key || '') === b.key ? b.key : '';
  if (!key) throw A.httpError(400, 'key is a candidate key');
  var ref = db.collection('sales_candidates').doc(key);
  return ref.get().then(function (s) {
    if (!s.exists) throw A.httpError(404, 'no such candidate');
    var c = s.data() || {};
    if (b.skip === true) {
      c.status = 'skipped'; c.reason = S.clean(b.reason, 200) || 'not a fit'; c.updatedAt = iso(now); c.updatedBy = caller.by;
      return ref.set(c).then(function () { return { ok: true, key: key, status: 'skipped' }; });
    }
    var p = b.prospect || {};
    var inc = S.cleanProspect({ company: p.company || c.company, domain: p.domain, website: p.website, vertical: p.vertical || c.vertical,
      state: p.state || (c.states || [])[0], city: p.city, contacts: p.contacts, summary: p.summary, next: p.next, tags: (c.tags || []).concat(p.tags || []),
      evidence: (c.evidence || []).concat(p.evidence || []), source: { kind: 'harvest', ref: ((c.sources || [])[0] || {}).ref || key } });
    if (!inc.ok) throw A.httpError(400, inc.error);
    if (inc.prospect.id.indexOf('@') >= 0) throw A.httpError(400, 'a candidate resolves to a company domain, not a public mailbox');
    var pref = prospectRef(db, inc.prospect.id);
    return pref.get().then(function (ps) {
      var merged = S.mergeProspect(ps.exists ? (ps.data() || {}) : null, inc.prospect, now);
      if (!ps.exists) merged.createdBy = caller.by;
      merged.updatedBy = caller.by;
      c.status = 'enriched'; c.domain = inc.prospect.id; c.updatedAt = iso(now); c.updatedBy = caller.by;
      var batch = db.batch();
      batch.set(pref, merged);
      batch.set(ref, c);
      return batch.commit().then(function () { return { ok: true, key: key, status: 'enriched', prospectId: inc.prospect.id, created: !ps.exists }; });
    });
  });
}

var CHANNELS = ['gmail-drafts', 'scheduler', 'manual'];
function setConfig(db, caller, b, now) {
  if (!caller.staff) throw A.httpError(403, 'the agent\'s switch and sender are a person\'s to set');
  var patch = {}, changed = [];
  if (b.enabled != null) { patch.enabled = b.enabled === true; changed.push('enabled'); }
  if (b.sender != null) {
    var e = S.normEmail(b.sender);
    /* docs/SALES-AGENT.md §10.1: a monitored clearsky-usa.com mailbox. Never
       a personal gmail.com address, never the retired csebuilders.com. */
    if (b.sender !== '' && (!e || e.split('@')[1] !== 'clearsky-usa.com')) throw A.httpError(400, 'the sender must be a clearsky-usa.com mailbox');
    patch.sender = e || null; changed.push('sender');
  }
  if (b.senderName != null) { patch.senderName = S.clean(b.senderName, 80) || null; changed.push('senderName'); }
  if (b.postalAddress != null) {
    var addr = S.clean(b.postalAddress, 300);
    if (addr && !(/\d/.test(addr) && /,/.test(addr))) throw A.httpError(400, 'a postal address needs a street number and a city, state line');
    patch.postalAddress = addr || null; changed.push('postalAddress');
  }
  if (b.dailyDraftCap != null) { var n = Math.round(Number(b.dailyDraftCap)); if (!(n >= 1 && n <= 100)) throw A.httpError(400, 'dailyDraftCap is 1–100'); patch.dailyDraftCap = n; changed.push('dailyDraftCap'); }
  if (b.linkedinChannel != null) { if (CHANNELS.indexOf(b.linkedinChannel) < 0) throw A.httpError(400, 'linkedinChannel is ' + CHANNELS.join(' | ')); patch.linkedinChannel = b.linkedinChannel; changed.push('linkedinChannel'); }
  if (b.demoLink != null) { var u = S.clean(b.demoLink, 200); if (u && !/^https:\/\//.test(u)) throw A.httpError(400, 'demoLink must be an https link'); patch.demoLink = u || null; changed.push('demoLink'); }
  if (b.offLimits != null) {
    if (!Array.isArray(b.offLimits) || b.offLimits.length > 100) throw A.httpError(400, 'offLimits is a list of at most 100 { domain, why }');
    patch.offLimits = b.offLimits.map(function (o) { return { domain: S.normDomain(o && o.domain), why: S.clean(o && o.why, 160) }; }).filter(function (o) { return o.domain; });
    changed.push('offLimits');
  }
  if (!changed.length) throw A.httpError(400, 'nothing to change');
  patch.updatedAt = iso(now); patch.updatedBy = caller.by;
  var batch = db.batch();
  batch.set(db.collection('sales_config').doc('current'), patch, { merge: true });
  batch.set(db.collection('sales_activity').doc(), { kind: 'note', at: iso(now), by: caller.by, summary: 'Sales settings changed: ' + changed.join(', ') });
  return batch.commit().then(function () { return { ok: true, changed: changed }; });
}

module.exports = A.handler(function (req) {
  var now = Date.now(), q = req.query || {};
  if (req.method === 'GET') {
    return K.staffOrAgent(req, 'sales:read').then(function () {
      var db = A.db();
      if (q.prospect) {
        var id = String(q.prospect).toLowerCase(), ref = prospectRef(db, id);
        return Promise.all([ref.get(), soft(db.collection('sales_activity').where('prospectId', '==', id).limit(200).get(), EMPTY)]).then(function (r) {
          if (!r[0].exists) throw A.httpError(404, 'no such prospect');
          var p = r[0].data() || {}; p.id = id;
          var acts = rows(r[1]).sort(function (a, b) { return String(b.at || '').localeCompare(String(a.at || '')); });
          return { prospect: p, activity: acts };
        });
      }
      var view = String(q.view || '');
      if (view === 'office') return O.list(db);
      if (view === 'agent') return agentPacket(db, now);
      if (view === 'prospects') {
        return loadProspects(db).then(function (list) {
          var stage = String(q.stage || ''), vertical = String(q.vertical || ''), state = String(q.state || '').toUpperCase(), needle = String(q.q || '').toLowerCase();
          var lim = Math.max(1, Math.min(500, Number(q.limit) || 100));
          var out = list.filter(function (p) {
            return (!stage || p.stage === stage) && (!vertical || p.vertical === vertical) && (!state || p.state === state)
              && (!needle || String(p.company || '').toLowerCase().indexOf(needle) >= 0 || String(p.id).indexOf(needle) >= 0);
          }).sort(function (a, b) { return (b.score || 0) - (a.score || 0) || String(a.company || a.id).localeCompare(String(b.company || b.id)); });
          return { total: out.length, prospects: out.slice(0, lim), capped: list.length >= MAX_PROSPECTS };
        });
      }
      if (view === 'activity') {
        var n = Math.max(1, Math.min(500, Number(q.limit) || 100)), kind = String(q.kind || '');
        return loadActivity(db, kind ? MAX_ACTIVITY : n).then(function (list) { return { activity: list.filter(function (a) { return !kind || a.kind === kind; }).slice(0, n) }; });
      }
      if (view === 'candidates') {
        var status = String(q.status || 'new'), lim2 = Math.max(1, Math.min(500, Number(q.limit) || 50));
        return soft(db.collection('sales_candidates').where('status', '==', status).limit(MAX_PROSPECTS).get(), EMPTY).then(function (snap) {
          var list = rows(snap).sort(function (a, b) { return (b.projects || 0) - (a.projects || 0) || String(a.company).localeCompare(String(b.company)); });
          return { total: list.length, candidates: list.slice(0, lim2) };
        });
      }
      if (view === 'suppressions') {
        return soft(db.collection('sales_suppressions').limit(MAX_SUPPRESSED).get(), EMPTY).then(function (s) { return { suppressions: rows(s) }; });
      }
      if (view) throw A.httpError(400, 'unknown view');
      return dashboard(db, now).then(function (x) { return x.d; });
    });
  }
  if (req.method !== 'POST') throw A.httpError(405, 'GET or POST');
  var b = req.body || {}, action = String(b.action || '');
  var readOnly = action === 'screen' || action === 'lint-post';
  return K.staffOrAgent(req, readOnly ? 'sales:read' : 'sales:write').then(function (caller) {
    var db = A.db();
    if (action === 'office-mail') return require('./_lib/office-mail').activity(db, caller, b);
    if (action === 'office-mailbox') return require('./_lib/office-mail').provision(db, caller, b);
    if (action === 'office-agent') return O.save(db, caller, b, now);
    if (action === 'office-add-task') return O.addTask(db, caller, b, now);
    if (action === 'office-task') return O.transition(db, caller, b, now);
    if (action === 'upsert-prospects') return upsertProspects(db, caller, b, now);
    if (action === 'log') return logEntries(db, caller, b, now);
    if (action === 'upsert-candidates') return upsertCandidates(db, caller, b, now);
    if (action === 'resolve-candidate') return resolveCandidate(db, caller, b, now);
    if (action === 'stage') return setStage(db, caller, b, now);
    if (action === 'suppress') return suppress(db, caller, b, now);
    if (action === 'config') return setConfig(db, caller, b, now);
    if (action === 'screen') {
      var emails = Array.isArray(b.emails) ? b.emails.slice(0, MAX_SCREEN) : [];
      if (!emails.length) throw A.httpError(400, 'emails[] required');
      return Promise.all([loadConfig(db), loadSuppressed(db)]).then(function (r) {
        var cold = !(r[0].sender && r[0].postalAddress);
        return Promise.all(emails.map(function (e) {
          var addr = S.normEmail(e);
          if (!addr) return { email: String(e), ok: false, reason: 'not an email address' };
          return warmth(db, addr).then(function (w) {
            var sc = S.screen(addr, screenCtx(r[0], r[1], w.inbound || w.customer));
            /* CAN-SPAM: no cold mail without a monitored sender and a postal address */
            if (sc.ok && cold && !w.inbound && !w.customer) sc = { ok: false, reason: 'cold email is blocked until sales_config has a sender and a postal address' };
            sc.email = addr; sc.inbound = w.inbound; sc.customer = w.customer;
            return sc;
          });
        })).then(function (results) { return { results: results }; });
      });
    }
    if (action === 'lint-post') {
      var text = String(b.text == null ? '' : b.text);
      var tagged = b.campaign ? S.tagLinks(text, b.campaign) : text;
      return { lint: S.lintPost(tagged), text: tagged };
    }
    throw A.httpError(400, 'unknown action');
  });
});
