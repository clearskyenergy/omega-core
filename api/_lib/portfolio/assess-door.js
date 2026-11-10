/* ═══════════════════════════════════════════════════════════════════════════
   api/_lib/portfolio/assess-door.js — the site assessment's actions on the
   site CRM's one door (api/site-crm.js mounts it)
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   api/site-crm.js routes here after its own access check (the caller's
   workspace; a write needs an editor: owner, admin or member):
     POST assess-run { ids[] }            the assessment on each site, from
          the facts and the screens already on it (assess.js): power, the
          compute shelf, the battery, fast charging, the readiness score.
          At most RUN_CAP a call; the page chunks a whole register.
     POST assess-screen-start { ids[], force? } / assess-screen-step { jobId }
          the SCREENS, a job on site_jobs, one phase of one site a step:
          the Grid Atlas screen (grid-screen.js: the point, the substation,
          then fiber and the utility's hosting figure), then the PARCEL
          under the point (api/parcel.js: zoning, acres, county), then the
          assessment again on what was learned. Every handler is invoked
          in-process with the caller's own headers, so each runs its own
          sign-in and plan gate; a screen a plan does not carry is an error
          on the record, never a failure of the run.
     POST assess-check { site, item, state: open|done|na, note? }
          a person's mark on one readiness item; the score follows
     POST assess-approve { ids[] | site, uses: [compute|bess|supercharger], note? }
          APPROVE FOR PRE-DEVELOPMENT (one use or a hybrid): the decision on
          the site, its status to Pre-development, the project kinds the
          Site Map project will open on; uses: [] withdraws the approval
     POST assess-upgrade { ids[] | site, status?: requested|granted|declined|
          withdrawn, unit? | targetKw?, askedBy?, note? }
          A UTILITY-SIDE UPGRADE REQUEST marked on the site: the power asked
          for at the meter (a shelf unit's, or a figure), who is asking (the
          site's portfolio partner unless named), and where it stands. It
          never changes what is sized today; the answer carries what the
          upgrade would carry beside it.
     POST assess-fund-submit { ids[] | site, uses[], note? }
     POST assess-fund-withdraw { ids[] | site }
     POST assess-fund-decide { ids[] | site, decision: approved|declined, note? }
          THE FUNDING LIST, for a workspace whose settings name a finance
          committee (portfolioAssessment.funding; 409 elsewhere): a site is
          SCREENED first, then submitted with what the funding is for, then
          approved or declined by a member of the committee signed in on a
          VERIFIED address (403 for anybody else, staff included). Each
          site answers for itself: a refusal names the site and why.
     POST assess-closing { ids[] | site, step: purchase|assignment|lease, done?, years?, note? }
          A CLOSING STEP recorded on a site (409 where the workspace's
          settings carry none): it is purchased, its host agreement is
          assigned to the workspace, a lease of the years typed is in
          place. An editor's; done: false takes a step back. A record of
          what was done, never the doing of it.
     POST assess-review-vote { ids[] | site, vote: own|flip|clear, note? }
          THE REVIEW, for a workspace whose settings name one
          (portfolioAssessment.review; 409 elsewhere): one member's vote on
          a site, own and operate or portfolio / flip, on a VERIFIED
          address (403 for anybody else, staff included). The decision is
          DERIVED: it stands when every member has voted the same way.
     GET  (one site, &assessment=1)  fullView(): the whole answer, with the
          yearly tables and the checklist
     GET  (register)  listJoin(): the row a site, without the tables

   Writes: omega_orgs/{org}/sites/{id}.assessment { result, screen, parcel,
   checklist, decision, statusBefore, upgrade, funding, at, by } — and, for
   an approval, status and siteScopes (a withdrawal puts back the status the
   site had: statusBefore) — never the site's facts, revision or updatedAt (an
   assessment is not a fact change: the compute model must not run again on
   it). Where the compute-site diligence is switched on for the workspace,
   the same screen also lands on diligence.screen by the diligence's own
   rule, so the two never disagree. Jobs in site_jobs, an omega_audit row
   for each write (action sitecrm-assess-*). All Admin SDK only.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var AS = require('./assess'), G = require('./grid-screen'), D = require('./diligence'), BR = require('./site-bridge');

var ACTIONS = ['assess-run', 'assess-screen-start', 'assess-screen-step', 'assess-check', 'assess-approve', 'assess-upgrade', 'assess-fund-submit', 'assess-fund-withdraw', 'assess-fund-decide', 'assess-review-vote', 'assess-closing'];
var RUN_CAP = 50, SCREEN_IDS_CAP = 200, APPROVE_CAP = 200, MARK_CAP = 200, SCREEN_FRESH_DAYS = 7, PARCEL_TIMEOUT = 12000;

function owns(action) { return ACTIONS.indexOf(String(action || '')) >= 0; }
function day(now) { return String(now).slice(0, 10); }
function plain(x) { return x == null ? x : JSON.parse(JSON.stringify(x)); }
function hash(s) { var h = 0x811c9dc5; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0; } return ('0000000' + h.toString(16)).slice(-8); }
function idList(v, cap, fail) {
  var ids = Array.isArray(v) ? v.map(String).filter(function (x, i, a) { return /^[A-Za-z0-9_.-]{1,120}$/.test(x) && a.indexOf(x) === i; }) : [];
  if (!ids.length) throw fail(400, 'Choose the sites');
  if (ids.length > cap) throw fail(400, 'At most ' + cap + ' sites a call');
  return ids;
}
/* the parcel answer as the assessment keeps it: never the ring */
function parcelOf(r, now) {
  var b = r && r.body || {};
  if (!(r && r.status === 200)) return { ok: false, reason: b.error ? String(b.error).slice(0, 200) : 'the parcel lookup did not answer (' + (r ? r.status : 'no reply') + ')', at: now };
  if (b.ok !== true) return { ok: false, reason: String(b.reason || 'no parcel record here').slice(0, 200), at: now };
  function s(v, n) { return v == null || v === '' ? null : String(v).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n) || null; }
  return { ok: true, apn: s(b.apn, 60), owner: s(b.owner, 160), acres: b.acres != null && isFinite(Number(b.acres)) ? Math.round(Number(b.acres) * 100) / 100 : null, zoning: s(b.zoning, 80), county: s(b.county, 80), source: s(b.source, 30), at: now };
}

function make(deps) {
  var A = deps.A;
  function fail(s, m) { return A.httpError ? A.httpError(s, m) : Object.assign(new Error(m), { status: s }); }
  async function billingOf(root) { var b = await root.collection('billing').doc('current').get(); return b.exists ? b.data() || {} : {}; }
  function flat(id, data) { return BR.flatten(BR.normalize(id, data || {})); }
  /* the screen the answer reads: the assessment's own, else the diligence's where one is complete */
  function screenOf(data) { var a = data && data.assessment, d = data && data.diligence; return (a && a.screen) || (d && d.screen && d.screen.complete ? d.screen : null) || null; }
  function compute(id, data, cfg) {
    var a = (data && data.assessment) || {};
    return AS.assess(flat(id, data), { screen: screenOf(data), parcel: a.parcel || null, marks: a.checklist || null, upgrade: a.upgrade || null, config: cfg, now: deps.now() });
  }
  function mustEdit(c) { if (c.canEdit === false) throw fail(403, 'Your role in this workspace can read the assessment but not run it'); }

  /* ── Run: the assessment on each site, from what is on file ──────────── */
  async function run(c) {
    mustEdit(c);
    var ids = idList(c.b.ids, RUN_CAP, fail), cfg = AS.configOf(await billingOf(c.root));
    var snaps = await Promise.all(ids.map(function (id) { return c.root.collection('sites').doc(id).get(); }));
    var batch = c.db.batch(), ran = [], missing = [], sized = 0;
    snaps.forEach(function (s) {
      if (!s.exists) { missing.push(s.id); return; }
      var data = s.data() || {}, a = Object.assign({}, data.assessment || {}), result = compute(s.id, data, cfg);
      a.result = result; a.at = deps.now(); a.by = c.by;
      batch.update(s.ref, { assessment: plain(a) });
      if (result.power.availableKw != null) sized++;
      ran.push({ siteId: s.id, availableKw: result.power.availableKw, basis: result.power.basis });
    });
    if (ran.length) {
      batch.create(c.db.collection('omega_audit').doc(), plain({ action: 'sitecrm-assess-run', orgId: c.org, by: c.by, at: deps.now(), sites: ran.length, siteIds: ran.map(function (r) { return r.siteId; }) }));
      await batch.commit();
    }
    return { ok: true, ran: ran.length, sized: sized, missing: missing,
      note: ran.length + ' site' + (ran.length === 1 ? '' : 's') + ' assessed' + (ran.length - sized ? '; ' + (ran.length - sized) + ' with no power figure on file could not be sized' : '') + '.' };
  }

  /* ── the screens, a job a phase at a time ────────────────────────────── */
  function summary(j) {
    var items = j.items || {}, bad = Object.keys(items).filter(function (k) { return items[k].status === 'failed'; });
    return { id: j.id, status: j.status, total: j.total, done: j.done, failed: j.failed, kind: j.kind, failedIds: bad.slice(0, 20) };
  }
  async function screenStart(c) {
    mustEdit(c);
    var ids = idList(c.b.ids, SCREEN_IDS_CAP, fail), items = {}, fresh = [], cutoff = new Date(Date.parse(deps.now()) - SCREEN_FRESH_DAYS * 864e5).toISOString();
    var snaps = await Promise.all(ids.map(function (id) { return c.root.collection('sites').doc(id).get(); }));
    snaps.forEach(function (s) {
      if (!s.exists) throw fail(404, 'Not in this workspace’s register: ' + s.id);
      var sc = (s.data().assessment || {}).screen;
      if (sc && sc.complete && sc.at && sc.at > cutoff && c.b.force !== true) { fresh.push(s.id); return; }
      items[s.id] = { status: 'pending' };
    });
    var keys = Object.keys(items), jid = 'ascr_' + day(deps.now()).replace(/-/g, '') + '_' + hash(keys.sort().join(',') + '|' + c.by), jref = c.root.collection('site_jobs').doc(jid), ex = await jref.get();
    if (ex.exists && ex.data().status !== 'complete') return { ok: true, duplicate: true, job: summary(ex.data()), skippedFresh: fresh };
    var job = { id: jid, kind: 'assess-screen', status: keys.length ? 'paused' : 'complete', items: items, total: keys.length, done: 0, failed: 0, createdAt: deps.now(), createdBy: c.by, uid: c.caller.uid,
      note: 'One phase of one site a step; the page steps it to the end, and closing the page pauses it.' };
    await jref.set(job);
    await c.db.collection('omega_audit').doc().create({ action: 'sitecrm-assess-screen-start', orgId: c.org, by: c.by, at: deps.now(), jobId: jid, sites: job.total, skippedFresh: fresh.length });
    return { ok: true, job: summary(job), skippedFresh: fresh };
  }
  async function screenStep(c) {
    mustEdit(c);
    var jref = c.root.collection('site_jobs').doc(String(c.b.jobId || '')), js = await jref.get();
    if (!js.exists || js.data().kind !== 'assess-screen') throw fail(404, 'Screen not found');
    var job = js.data();
    if (job.status === 'complete' || job.status === 'cancelled') return { ok: true, job: summary(job) };
    var ids = Object.keys(job.items).filter(function (k) { return job.items[k].status === 'pending' || job.items[k].status === 'running'; });
    if (!ids.length) { job.status = 'complete'; await jref.set(job); return { ok: true, job: summary(job) }; }
    var id = ids[0], item = job.items[id], sref = c.root.collection('sites').doc(id), snap = await sref.get();
    if (!snap.exists) { job.items[id] = { status: 'failed', error: 'Site no longer exists' }; return finishStep(jref, job, id, null); }
    var billing = await billingOf(c.root), cfg = AS.configOf(billing), data = snap.data() || {}, norm = BR.normalize(id, data);
    var fcc = { keySet: !!(deps.env && deps.env.FCC_BB_KEY), left: 0 };
    if (fcc.keySet && item.partial && item.partial.phase === 'grid') {
      /* the FCC's lookups a day, the deployment's one counter (the diligence screen counts on the same one) */
      var cref = c.root.collection('site_jobs').doc('fcc_' + day(deps.now()));
      fcc.left = await c.db.runTransaction(async function (tx) { var cs = await tx.get(cref), n = cs.exists ? cs.data().count || 0 : 0; if (n >= G.FCC_DAILY_CAP) return 0; tx.set(cref, { count: n + 1, day: day(deps.now()) }, { merge: true }); return G.FCC_DAILY_CAP - n; });
    }
    var hd = deps.handlers(c.req), pw = AS.powerOf(flat(id, data), null);
    var r = await G.step(norm, item.partial || null, { atlas: hd.atlas, network: hd.network, hosting: hd.hosting, fcc: fcc }, { now: deps.now(), unitKw: pw.availableKw > 0 ? pw.availableKw : null });
    if (!r.done) { job.items[id] = { status: 'running', partial: plain(r.screen) }; return finishStep(jref, job, id, r); }
    /* the parcel under the point, once the point is good */
    var parcel = null, loc = r.screen.located;
    if (loc && loc.usable && typeof hd.parcel === 'function') {
      var pr; try { pr = await hd.parcel({ lat: loc.lat, lng: loc.lng }); } catch (e) { pr = { status: e && e.status || 502, body: { error: String(e && e.message || e).slice(0, 200) } }; }
      parcel = parcelOf(pr, deps.now());
    }
    var landed = await c.db.runTransaction(async function (tx) {
      var cur = await tx.get(sref); if (!cur.exists) return null;
      var d2 = cur.data() || {}, a = Object.assign({}, d2.assessment || {});
      a.screen = plain(r.screen); if (parcel) a.parcel = parcel;
      var patch = {}, moved = [];
      /* the diligence, where it is on: the same screen by its own rule */
      if (D.enabled(billing)) {
        var st = BR.normalize(id, d2), ch = D.change(st.diligence, 'screen', { screen: r.screen }, { site: st, config: D.configOf(billing), role: 'member', canEdit: true, by: c.by, now: deps.now() });
        patch.diligence = plain(ch.diligence); moved = ch.event.moved || []; d2 = Object.assign({}, d2, { diligence: ch.diligence });
      }
      a.result = AS.assess(flat(id, Object.assign({}, d2, { assessment: a })), { screen: a.screen, parcel: a.parcel || null, marks: a.checklist || null, upgrade: a.upgrade || null, config: cfg, now: deps.now() });
      a.at = deps.now(); a.by = c.by; patch.assessment = plain(a);
      tx.update(sref, patch);
      tx.create(c.db.collection('omega_audit').doc(), { action: 'sitecrm-assess-screen', orgId: c.org, siteId: id, by: c.by, at: deps.now(), jobId: job.id, located: !!(loc && loc.usable), parcel: !!(parcel && parcel.ok), errors: (r.screen.errors || []).length, moved: moved });
      return { availableKw: a.result.power.availableKw };
    });
    job.items[id] = { status: !landed || ((r.screen.errors || []).length && !r.screen.located) ? 'failed' : 'done', parcel: !!(parcel && parcel.ok), errors: (r.screen.errors || []).map(function (e) { return e.source; }) };
    return finishStep(jref, job, id, r);
  }
  async function finishStep(jref, job, id, r) {
    var vals = Object.keys(job.items).map(function (k) { return job.items[k].status; });
    job.done = vals.filter(function (x) { return x === 'done'; }).length; job.failed = vals.filter(function (x) { return x === 'failed'; }).length;
    job.status = vals.some(function (x) { return x === 'pending' || x === 'running'; }) ? 'paused' : 'complete'; job.updatedAt = deps.now();
    await jref.set(plain(job));
    return { ok: true, job: summary(job), site: id, phase: r ? r.phase : null, item: job.items[id] };
  }

  /* ── one readiness item, marked by a person ──────────────────────────── */
  async function check(c) {
    mustEdit(c);
    if (!c.site) throw fail(400, 'Which site?');
    var item = String(c.b.item || ''), state = String(c.b.state || '');
    if (AS.ITEM_KEYS.indexOf(item) < 0) throw fail(400, 'That is not an item on the readiness checklist');
    if (AS.CHECK_STATES.indexOf(state) < 0) throw fail(400, 'An item is open, done or na');
    var note = typeof c.b.note === 'string' ? c.b.note.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 300) : '';
    var cfg = AS.configOf(await billingOf(c.root)), sref = c.root.collection('sites').doc(c.site);
    return c.db.runTransaction(async function (tx) {
      var cur = await tx.get(sref); if (!cur.exists) throw fail(404, 'Site not found');
      var data = cur.data() || {}, a = Object.assign({}, data.assessment || {}), marks = Object.assign({}, a.checklist || {}), was = marks[item] ? marks[item].state : 'open';
      if (state === 'open' && !note) delete marks[item]; else marks[item] = { state: state, note: note || null, by: c.by, at: deps.now() };
      a.checklist = marks;
      a.result = AS.assess(flat(c.site, data), { screen: screenOf(data), parcel: a.parcel || null, marks: marks, upgrade: a.upgrade || null, config: cfg, now: deps.now() });
      a.at = deps.now(); a.by = a.by || c.by;
      tx.update(sref, { assessment: plain(a) });
      tx.create(c.db.collection('omega_audit').doc(), plain({ action: 'sitecrm-assess-check', orgId: c.org, siteId: c.site, by: c.by, at: deps.now(), item: item, from: was, to: state, note: note || null }));
      return { ok: true, item: item, state: state, readiness: a.result.readiness, verify: a.result.verify };
    });
  }

  /* ── approve for pre-development: one use or a hybrid; [] withdraws ───── */
  async function approve(c) {
    mustEdit(c);
    var ids = c.site && !Array.isArray(c.b.ids) ? [c.site] : idList(c.b.ids, APPROVE_CAP, fail), dec = AS.decisionOf(c.b, { by: c.by, now: deps.now() });
    var snaps = await Promise.all(ids.map(function (id) { return c.root.collection('sites').doc(id).get(); }));
    var batch = c.db.batch(), n = 0, done = [], missing = [], notFitting = [];
    async function flush() { await batch.commit(); batch = c.db.batch(); n = 0; }
    for (var i = 0; i < snaps.length; i++) {
      var s = snaps[i];
      if (!s.exists) { missing.push(s.id); continue; }
      var data = s.data() || {}, a = Object.assign({}, data.assessment || {}), was = a.decision && a.decision.status === 'approved' ? a.decision.label : null;
      a.decision = plain(dec);
      /* the status the site had before it was approved, so a withdrawal puts it
         back (2026-11-09, Tommy: "why doesnt this say operational after i
         withdrew an approval": the approval wrote Pre-development over
         Operational and the withdrawal could only blank it) */
      var before = a.statusBefore != null ? a.statusBefore : (data.status && data.status !== AS.PREDEV_STATUS ? data.status : '');
      if (dec.status === 'approved') a.statusBefore = before; else delete a.statusBefore;
      var patch = { assessment: plain(a) };
      if (dec.status === 'approved') {
        patch.status = AS.PREDEV_STATUS;
        var scopes = Array.isArray(data.siteScopes) ? data.siteScopes.slice() : [];
        dec.scopes.forEach(function (k) { if (scopes.indexOf(k) < 0) scopes.push(k); });
        patch.siteScopes = scopes.slice(0, 7);
        var rec = a.result && a.result.recommend, fits = rec ? rec.fits.map(function (f) { return f.use; }) : null;
        if (fits) dec.uses.forEach(function (u) { if (fits.indexOf(u) < 0) notFitting.push({ siteId: s.id, name: data.name || s.id, use: u }); });
      } else if (data.status === AS.PREDEV_STATUS) patch.status = before;
      batch.update(s.ref, patch);
      batch.create(c.db.collection('omega_audit').doc(), plain({ action: 'sitecrm-assess-approve', orgId: c.org, siteId: s.id, by: c.by, at: deps.now(), status: dec.status, uses: dec.uses, was: was, note: dec.note }));
      done.push(s.id); n += 2;
      if (n >= 400) await flush();
    }
    if (n) await batch.commit();
    var words = dec.status === 'approved' ? done.length + ' site' + (done.length === 1 ? '' : 's') + ' approved for pre-development: ' + dec.label + '.' : 'Approval withdrawn on ' + done.length + ' site' + (done.length === 1 ? '' : 's') + '.';
    if (notFitting.length) words += ' Note: the assessment does not show ' + notFitting.slice(0, 3).map(function (x) { return x.use + ' fitting ' + x.name; }).join('; ') + (notFitting.length > 3 ? ' and ' + (notFitting.length - 3) + ' more' : '') + '.';
    return { ok: true, status: dec.status, uses: dec.uses, label: dec.label, count: done.length, ids: done, missing: missing, notFitting: notFitting, note: words };
  }

  /* ── one transaction a site: read, change by the library's rule, assess again where the answer moves ── */
  function idsOf(c) { return c.site && !Array.isArray(c.b.ids) ? [c.site] : idList(c.b.ids, MARK_CAP, fail); }
  async function each(c, ids, fn) {
    var done = [], refused = [];
    for (var i = 0; i < ids.length; i++) {
      var sref = c.root.collection('sites').doc(ids[i]);
      try {
        var r = await c.db.runTransaction(async function (tx) {
          var cur = await tx.get(sref); if (!cur.exists) throw fail(404, 'Not in this workspace’s register');
          return fn(tx, sref, cur.data() || {});
        });
        done.push(Object.assign({ siteId: ids[i] }, r || {}));
      } catch (e) {
        if (ids.length === 1 || !(e && e.status >= 400 && e.status < 500)) throw e;   /* one site: its own refusal; many: each answers for itself */
        refused.push({ siteId: ids[i], status: e.status, reason: e.message });
      }
    }
    return { done: done, refused: refused };
  }
  function refusedWords(refused, names) {
    if (!refused.length) return '';
    return ' ' + refused.length + ' not changed: ' + refused.slice(0, 3).map(function (r) { return (names[r.siteId] || r.siteId) + ' (' + r.reason + ')'; }).join('; ') + (refused.length > 3 ? ' and ' + (refused.length - 3) + ' more' : '') + '.';
  }

  /* ── a utility-side upgrade request, marked ──────────────────────────── */
  async function upgrade(c) {
    mustEdit(c);
    var ids = idsOf(c), cfg = AS.configOf(await billingOf(c.root)), names = {}, last = null;
    var out = await each(c, ids, function (tx, sref, data) {
      names[sref.id] = data.name || sref.id;
      var a = Object.assign({}, data.assessment || {}), site = flat(sref.id, data), pw = AS.powerOf(site, screenOf(data)), was = a.upgrade ? a.upgrade.status : null;
      a.upgrade = AS.upgradeOf(a.upgrade || null, c.b, { by: c.by, now: deps.now(), limitKw: pw.limitKw, availableKw: pw.availableKw, partner: site.portfolioPartner || data.portfolioPartner || null, pue: cfg.compute.pue });
      a.result = AS.assess(site, { screen: screenOf(data), parcel: a.parcel || null, marks: a.checklist || null, upgrade: a.upgrade, config: cfg, now: deps.now() });
      a.at = deps.now(); a.by = a.by || c.by;
      tx.update(sref, { assessment: plain(a) });
      tx.create(c.db.collection('omega_audit').doc(), plain({ action: 'sitecrm-assess-upgrade', orgId: c.org, siteId: sref.id, by: c.by, at: deps.now(), status: a.upgrade.status, was: was, targetKw: a.upgrade.targetKw, askedBy: a.upgrade.askedBy, note: a.upgrade.note }));
      last = a.result.upgrade;
      return { status: a.upgrade.status, targetKw: a.upgrade.targetKw };
    });
    var n = out.done.length, st = n ? out.done[0].status : String(c.b.status || 'requested');
    var words = { requested: 'Utility-side upgrade marked as requested on ', granted: 'Upgrade marked granted on ', declined: 'Upgrade marked declined on ', withdrawn: 'Upgrade request withdrawn on ' }[st] + n + ' site' + (n === 1 ? '' : 's') + '.' +
      (st === 'granted' && n ? ' Record the new service on each site so its sizes follow.' : '');
    return { ok: true, status: st, count: n, done: out.done, refused: out.refused, upgrade: ids.length === 1 ? last : undefined, note: words + refusedWords(out.refused, names) };
  }

  /* ── the funding list: submitted by an editor, decided by the committee ── */
  async function fund(c, action) {
    var ids = idsOf(c), cfg = AS.configOf(await billingOf(c.root)), names = {}, last = null;
    if (!cfg.funding) throw fail(409, 'This workspace has no funding list: it sends a site’s capital request to the finance marketplace');
    if (action === 'decide') {
      /* who decides is the committee, by a VERIFIED address: a password account can be opened on any address without proving it */
      if (!AS.committeeMember(cfg, c.by)) throw fail(403, 'Funding is decided by ' + cfg.funding.name + ' (' + cfg.funding.members.map(function (m) { return m.name; }).join(', ') + '). You can submit a site; you cannot approve or decline it');
      if (!(c.caller && c.caller.claims && c.caller.claims.email_verified === true)) throw fail(403, 'Confirm your email address first: a funding decision is recorded against a verified address');
    } else mustEdit(c);
    var out = await each(c, ids, function (tx, sref, data) {
      names[sref.id] = data.name || sref.id;
      var a = Object.assign({}, data.assessment || {}), sc = screenOf(data), was = a.funding ? a.funding.status : null;
      /* what is submitted is what is on file NOW: assessed again, so a stale figure never reaches the committee */
      var fresh = a.result ? AS.assess(flat(sref.id, data), { screen: sc, parcel: a.parcel || null, marks: a.checklist || null, upgrade: a.upgrade || null, config: cfg, now: deps.now() }) : null;
      a.funding = AS.fundingChange(a.funding || null, action, c.b, { by: c.by, now: deps.now(), config: cfg, result: fresh, screened: !!(sc && sc.complete), canEdit: c.canEdit });
      if (action === 'submit') { a.result = fresh; a.at = deps.now(); }
      tx.update(sref, { assessment: plain(a) });
      tx.create(c.db.collection('omega_audit').doc(), plain({ action: 'sitecrm-assess-fund-' + action, orgId: c.org, siteId: sref.id, by: c.by, at: deps.now(), status: a.funding.status, was: was, uses: a.funding.uses || [], amountUsd: a.funding.amountUsd == null ? null : a.funding.amountUsd, note: typeof c.b.note === 'string' ? c.b.note.slice(0, 500) : null }));
      last = AS.fundingView(a.funding);
      return { status: a.funding.status };
    });
    var n = out.done.length, sites = n + ' site' + (n === 1 ? '' : 's');
    var words = action === 'submit' ? sites + ' submitted to ' + cfg.funding.name.toLowerCase() + ' for funding.'
      : action === 'withdraw' ? sites + ' taken off the funding list.'
      : 'Funding ' + String(c.b.decision || '').toLowerCase() + ' on ' + sites + '.';
    return { ok: true, action: action, count: n, done: out.done, refused: out.refused, funding: ids.length === 1 ? last : undefined, note: words + refusedWords(out.refused, names) };
  }

  /* ── a closing step, recorded ────────────────────────────────────────── */
  async function closing(c) {
    mustEdit(c);
    var ids = idsOf(c), cfg = AS.configOf(await billingOf(c.root)), names = {}, last = null;
    if (!cfg.closing) throw fail(409, 'This workspace has no closing steps in its settings');
    var out = await each(c, ids, function (tx, sref, data) {
      names[sref.id] = data.name || sref.id;
      var a = Object.assign({}, data.assessment || {});
      a.closing = AS.closingChange(a.closing || null, c.b, { by: c.by, now: deps.now(), config: cfg, canEdit: c.canEdit });
      tx.update(sref, { assessment: plain(a) });
      last = AS.closingView(a.closing, cfg, flat(sref.id, data));
      tx.create(c.db.collection('omega_audit').doc(), plain({ action: 'sitecrm-assess-closing', orgId: c.org, siteId: sref.id, by: c.by, at: deps.now(), step: String(c.b.step || ''), done: c.b.done !== false && c.b.done !== 'false', years: c.b.years == null ? null : Number(c.b.years), complete: last.complete, note: typeof c.b.note === 'string' ? c.b.note.slice(0, 500) : null }));
      return { complete: last.complete };
    });
    var n = out.done.length, step = String(c.b.step || ''), undo = c.b.done === false || c.b.done === 'false';
    var word = { purchase: 'the purchase', assignment: 'the ' + cfg.closing.agreement + ' assignment', lease: 'the lease' + (c.b.years != null && !undo ? ' (' + Number(c.b.years) + ' years)' : '') }[step] || 'the step';
    return { ok: true, count: n, done: out.done, refused: out.refused, closing: ids.length === 1 ? last : undefined,
      note: (undo ? 'Took back ' : 'Recorded ') + word + ' on ' + n + ' site' + (n === 1 ? '' : 's') + '.' + (ids.length === 1 && last ? ' ' + last.words + '.' : '') + refusedWords(out.refused, names) };
  }

  /* ── the review: one member's vote; the decision is every member's, derived ── */
  async function review(c) {
    var ids = idsOf(c), cfg = AS.configOf(await billingOf(c.root)), names = {}, last = null;
    if (!cfg.review) throw fail(409, 'This workspace has no review board in its settings');
    if (!AS.reviewer(cfg, c.by)) throw fail(403, cfg.review.name + ' is ' + cfg.review.members.map(function (m) { return m.name; }).join(', ') + '. Only they vote');
    if (!(c.caller && c.caller.claims && c.caller.claims.email_verified === true)) throw fail(403, 'Confirm your email address first: a vote is recorded against a verified address');
    var out = await each(c, ids, function (tx, sref, data) {
      names[sref.id] = data.name || sref.id;
      var a = Object.assign({}, data.assessment || {});
      a.review = AS.reviewChange(a.review || null, c.b, { by: c.by, now: deps.now(), config: cfg });
      tx.update(sref, { assessment: plain(a) });
      last = AS.reviewView(a.review, cfg);
      tx.create(c.db.collection('omega_audit').doc(), plain({ action: 'sitecrm-assess-review-vote', orgId: c.org, siteId: sref.id, by: c.by, at: deps.now(), vote: String(c.b.vote || ''), outcome: last.outcome, note: typeof c.b.note === 'string' ? c.b.note.slice(0, 500) : null }));
      return { outcome: last.outcome };
    });
    var n = out.done.length, v = String(c.b.vote || '').toLowerCase();
    return { ok: true, count: n, done: out.done, refused: out.refused, review: ids.length === 1 ? last : undefined,
      note: (v === 'clear' ? 'Your vote is withdrawn on ' : 'Your vote (' + (v === 'own' ? 'own and operate' : 'portfolio / flip') + ') is recorded on ') + n + ' site' + (n === 1 ? '' : 's') + '.' + (ids.length === 1 && last ? ' ' + last.words + '.' : '') + refusedWords(out.refused, names) };
  }

  async function post(c) {
    var action = String(c.b.action || '');
    if (action === 'assess-review-vote') return review(c);
    if (action === 'assess-closing') return closing(c);
    if (action === 'assess-upgrade') return upgrade(c);
    if (action === 'assess-fund-submit') return fund(c, 'submit');
    if (action === 'assess-fund-withdraw') return fund(c, 'withdraw');
    if (action === 'assess-fund-decide') return fund(c, 'decide');
    if (action === 'assess-run') return run(c);
    if (action === 'assess-screen-start') return screenStart(c);
    if (action === 'assess-screen-step') return screenStep(c);
    if (action === 'assess-check') return check(c);
    if (action === 'assess-approve') return approve(c);
    throw fail(400, 'Unknown assessment action');
  }
  /* one site, whole: recomputed on what is on file now, with the yearly tables and the checklist */
  async function fullView(c, ref, data) {
    var cfg = AS.configOf(await billingOf(c.root)), a = (data && data.assessment) || {};
    var result = compute(ref.id, data, cfg);
    return { result: result, ranAt: a.at || null, ranBy: a.by || null, stored: !!a.result, stale: !!a.result && a.result.inputHash !== result.inputHash,
      screen: screenOf(data), parcel: a.parcel || null, decision: a.decision && a.decision.status === 'approved' ? a.decision : null, uses: AS.USES,
      funding: AS.fundingView(a.funding), fundingHistory: a.funding && Array.isArray(a.funding.history) ? a.funding.history : [], upgradeHistory: a.upgrade && Array.isArray(a.upgrade.history) ? a.upgrade.history : [],
      gates: AS.gatesOf(flat(ref.id, data), result, cfg, a), review: AS.reviewView(a.review, cfg), closing: AS.closingView(a.closing, cfg, flat(ref.id, data)), closingHistory: a.closing && Array.isArray(a.closing.history) ? a.closing.history : [] };
  }
  /* the workspace's review board, as the pages may know it (null where there is none) */
  async function reviewInfo(c) { return AS.reviewInfo(AS.configOf(await billingOf(c.root)), c.caller && c.caller.claims && c.caller.claims.email_verified === true ? c.by : null); }
  /* what the pages may know of the funding list: the committee's names and whether this caller decides; null where there is none */
  async function info(c) { return AS.fundingInfo(AS.configOf(await billingOf(c.root)), c.caller && c.caller.claims && c.caller.claims.email_verified === true ? c.by : null); }
  async function fundingMode(c) { return !!AS.configOf(await billingOf(c.root)).funding; }
  /* the register: a row a site */
  async function listJoin(c, docs) {
    var cfg = AS.configOf(await billingOf(c.root)), rows = {};
    docs.forEach(function (d) { var data = typeof d.data === 'function' ? d.data() : d; rows[d.id] = AS.listView(data && data.assessment, flat(d.id, data), { config: cfg }); });
    return rows;
  }
  return { post: post, fullView: fullView, listJoin: listJoin, parcelOf: parcelOf, info: info, fundingMode: fundingMode, reviewInfo: reviewInfo };
}

function live() {
  var A = require('../admin');
  return make({ A: A, now: function () { return new Date().toISOString(); }, env: process.env,
    handlers: function (req) {
      var headers = (req && req.headers) || {};
      function bind(path, timeout) { return function (body) { return G.invoke(require(path), { method: 'POST', headers: headers, body: body, query: {} }, timeout); }; }
      return { atlas: bind('../../grid-atlas', G.TIMEOUT.grid), network: bind('../../network-proximity', G.TIMEOUT.network), hosting: bind('../../hosting-capacity', G.TIMEOUT.hosting), parcel: bind('../../parcel', PARCEL_TIMEOUT) };
    } });
}
var instance = null;
function get() { if (!instance) instance = live(); return instance; }
module.exports = { ACTIONS: ACTIONS, RUN_CAP: RUN_CAP, owns: owns, make: make, parcelOf: parcelOf,
  post: function (c) { return get().post(c); }, fullView: function (c, ref, data) { return get().fullView(c, ref, data); }, listJoin: function (c, docs) { return get().listJoin(c, docs); },
  info: function (c) { return get().info(c); }, fundingMode: function (c) { return get().fundingMode(c); }, reviewInfo: function (c) { return get().reviewInfo(c); } };
