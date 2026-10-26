/* ═══════════════════════════════════════════════════════════════════════════
   api/_lib/portfolio/diligence-door.js — the compute-site diligence's actions
   on the site CRM's one door (api/site-crm.js mounts it)
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   api/site-crm.js routes here, after its own access check (the caller's
   workspace; a write needs an editor: owner, admin or member):
     POST diligence-decide | -stage | -gate | -control | -offtake |
          -chargers | -profile | -survey   { site, …the change's input }
     POST diligence-screen-start { ids[], force? }   the Grid Atlas screen,
          a job on site_jobs; diligence-screen-step { jobId } runs one phase
          of one site (grid-screen.js), the page stepping it to the end
     POST diligence-loi { ids?, note? }   ONE LOI package to the workspace's
          offtake partner (loi-package.js), mailed, then each site to LOI sent
     GET  (one site)   siteView(): the diligence view, the schema, the name
     GET  (register)   registerJoin(): a row a site, the pipeline, the tally
   Every one answers 403 where billing/current.toolOverrides
   ['portfolio-diligence'] is not literally true (diligence.js enabled()),
   and the GETs then carry nothing, so the pages draw nothing new.

   Writes: omega_orgs/{org}/sites/{id}.diligence (and .partners.<key> for the
   LOI), never the site's facts, revision or updatedAt (a diligence change is
   not a fact change: the compute model must not run again on it); jobs in
   site_jobs, the package in partner_requests, an omega_audit row for each
   (action sitecrm-diligence-*). All Admin SDK only; the rules close them.

   The contract case (api/_lib/compute-contract.js contractCase, PR #381) is
   read where it is deployed and skipped where it is not: the economics then
   stand on the record's own screening figures, said so.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var D = require('./diligence'), G = require('./grid-screen'), L = require('./loi-package'), BR = require('./site-bridge');

var CHANGE = { 'diligence-decide': 'decide', 'diligence-stage': 'stage', 'diligence-gate': 'gate', 'diligence-control': 'control', 'diligence-offtake': 'offtake',
  'diligence-chargers': 'chargers', 'diligence-profile': 'profile', 'diligence-survey': 'survey' };
var ACTIONS = Object.keys(CHANGE).concat(['diligence-screen-start', 'diligence-screen-step', 'diligence-loi']);
var SCREEN_IDS_CAP = 200, SCREEN_FRESH_DAYS = 7, SITE_SCAN = 2000;

function owns(action) { return ACTIONS.indexOf(String(action || '')) >= 0; }
function day(now) { return String(now).slice(0, 10); }
function plain(x) { return x == null ? x : JSON.parse(JSON.stringify(x)); }
function hash(s) { var h = 0x811c9dc5; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0; } return ('0000000' + h.toString(16)).slice(-8); }
/* the chip a site's diligence chose, as the contract case's chipset key */
function chipKey(name) { var k = String(name || '').toLowerCase().replace(/nvidia|amd/g, '').replace(/[^a-z0-9]/g, ''); return k || null; }

function make(deps) {
  var A = deps.A;
  function fail(s, m) { return A.httpError ? A.httpError(s, m) : Object.assign(new Error(m), { status: s }); }
  async function billingOf(root) { var b = await root.collection('billing').doc('current').get(); return b.exists ? b.data() || {} : {}; }
  async function scope(c) {
    var billing = await billingOf(c.root);
    if (!D.enabled(billing)) throw fail(403, 'The compute-site diligence is not switched on for this workspace');
    var orgDoc = await c.root.get(), org = orgDoc.exists ? orgDoc.data() || {} : {};
    var role = c.role || null;
    if (!role) { if (c.caller.staff) role = 'staff'; else { var m = await c.root.collection('members').doc(c.caller.uid).get(); role = m.exists ? (m.data() || {}).role || null : null; } }
    return { billing: billing, config: D.configOf(billing), brand: D.brandOf(org, c.org), role: role };
  }
  async function kids(ref, name) { var s = await ref.collection(name).limit(500).get(); return s.docs.map(function (d) { return Object.assign({ id: d.id }, d.data() || {}); }); }
  function filesOf(list) { return list.map(function (f) { return { id: f.id, name: f.name || null, category: f.category || null, uploadState: f.uploadState || null, archived: f.archived === true }; }); }
  /* The contract case on what the site's diligence holds: the power for
     compute, the chips chosen, the offtake's terms, the control route's
     money. Skipped (null) with no power and no units chosen: a case sized on
     nothing would be a false result. */
  function caseFor(site, cfg, opts) {
    if (typeof deps.contractCase !== 'function') return null;
    var v = D.view(site, { config: cfg, now: deps.now() }), off = v.offtake, c = (site.diligence && site.diligence.control) || {}, chips = (v.gates.chips.value || {});
    var kw = v.power.availableKw, units = chips.units > 0 ? chips.units : null;
    if (!(kw > 0) && !units) return null;
    var input = { chipset: chipKey(chips.chipset) || undefined, availableKw: kw > 0 ? kw : undefined, units: units || undefined,
      contract: { termMonths: off.termYears != null ? Math.round(off.termYears * 12) : undefined, pricePerGpuHour: off.pricePerGpuHour != null ? off.pricePerGpuHour : undefined,
        takeOrPayPct: off.takeOrPayPct != null ? off.takeOrPayPct : undefined, partner: off.partner === false ? false : off.partner ? { name: off.partner.name, feePct: off.feePct != null ? off.feePct : undefined } : undefined },
      site: { route: c.route || undefined } };
    if (c.route === 'lease' && c.lease && c.lease.rentMonthlyUsd != null) { input.site.rentMonthly = c.lease.rentMonthlyUsd; if (c.lease.escalatorPct != null) input.site.rentEscalatorPct = c.lease.escalatorPct; }
    if (c.route === 'takeover' && c.takeover) { if (c.takeover.rentMonthlyUsd != null) input.site.rentMonthly = c.takeover.rentMonthlyUsd; if (c.takeover.revenueSharePct != null) input.site.revenueSharePct = c.takeover.revenueSharePct; }
    if (c.route === 'buy' && c.buy && c.buy.priceUsd != null) input.site.purchasePriceUsd = c.buy.priceUsd;
    input = plain(input);
    try { var out = deps.contractCase(input, opts || {}); return out && out.ok !== false ? { output: out, input: input, at: deps.now() } : null; }
    catch (e) { return null; }
  }
  function viewCtx(s, extra) { return Object.assign({ config: s.config, now: deps.now() }, extra || {}); }

  /* ── one change to one site ──────────────────────────────────────────── */
  async function change(c, s, action, input) {
    if (!c.site) throw fail(400, 'Which site?');
    var ref = c.root.collection('sites').doc(c.site), files = filesOf(await kids(ref, 'files')), agreements = await kids(ref, 'agreements');
    var before = await ref.get(); if (!before.exists) throw fail(404, 'Site not found');
    var kase = caseFor(BR.normalize(ref.id, before.data()), s.config);
    return c.db.runTransaction(async function (tx) {
      var snap = await tx.get(ref); if (!snap.exists) throw fail(404, 'Site not found');
      var site = BR.normalize(ref.id, snap.data() || {});
      var r = D.change(site.diligence, action, input, { site: site, config: s.config, files: files, agreements: agreements, kase: kase, role: s.role, canEdit: c.canEdit !== false, by: c.by, now: deps.now() });
      if (!r.unchanged) {
        tx.update(ref, { diligence: plain(r.diligence) });
        tx.create(c.db.collection('omega_audit').doc(), plain({ action: 'sitecrm-diligence-' + action, orgId: c.org, siteId: ref.id, by: c.by, at: deps.now(), what: r.event.what, from: r.event.from, to: r.event.to, note: r.event.note || null }));
        site.diligence = r.diligence;
      }
      return { ok: true, unchanged: r.unchanged === true, event: r.event || null, diligence: D.view(site, viewCtx(s, { files: files, agreements: agreements, kase: kase })) };
    });
  }

  /* ── the Grid Atlas screen, a job a phase at a time ──────────────────── */
  async function screenStart(c, s) {
    var ids = Array.isArray(c.b.ids) ? c.b.ids.map(String).filter(function (x, i, a) { return /^[A-Za-z0-9_.-]{1,120}$/.test(x) && a.indexOf(x) === i; }) : [];
    if (!ids.length) throw fail(400, 'Choose the sites to screen');
    if (ids.length > SCREEN_IDS_CAP) throw fail(400, 'At most ' + SCREEN_IDS_CAP + ' sites a screen');
    var items = {}, fresh = [], cutoff = new Date(Date.parse(deps.now()) - SCREEN_FRESH_DAYS * 864e5).toISOString();
    for (var i = 0; i < ids.length; i++) {
      var snap = await c.root.collection('sites').doc(ids[i]).get();
      if (!snap.exists) throw fail(404, 'Not in this workspace’s register: ' + ids[i]);
      var sc = snap.data() && snap.data().diligence && snap.data().diligence.screen;
      if (sc && sc.complete && sc.at && sc.at > cutoff && c.b.force !== true) { fresh.push(ids[i]); continue; }
      items[ids[i]] = { status: 'pending' };
    }
    var jid = 'dscr_' + day(deps.now()).replace(/-/g, '') + '_' + hash(Object.keys(items).sort().join(',') + '|' + c.by), jref = c.root.collection('site_jobs').doc(jid), ex = await jref.get();
    if (ex.exists && ex.data().status !== 'complete') return { ok: true, duplicate: true, job: summary(ex.data()), skippedFresh: fresh };
    var job = { id: jid, kind: 'diligence-screen', status: Object.keys(items).length ? 'paused' : 'complete', items: items, total: Object.keys(items).length, done: 0, failed: 0, createdAt: deps.now(), createdBy: c.by, uid: c.caller.uid,
      note: 'One phase of one site a step; the page steps it to the end, and closing the page pauses it.' };
    await jref.set(job);
    await c.db.collection('omega_audit').doc().create({ action: 'sitecrm-diligence-screen-start', orgId: c.org, by: c.by, at: deps.now(), jobId: jid, sites: job.total, skippedFresh: fresh.length });
    return { ok: true, job: summary(job), skippedFresh: fresh };
  }
  function summary(j) { return { id: j.id, status: j.status, total: j.total, done: j.done, failed: j.failed, kind: j.kind }; }
  async function screenStep(c, s) {
    var jref = c.root.collection('site_jobs').doc(String(c.b.jobId || '')), js = await jref.get();
    if (!js.exists || js.data().kind !== 'diligence-screen') throw fail(404, 'Screen not found');
    var job = js.data();
    if (job.status === 'complete' || job.status === 'cancelled') return { ok: true, job: summary(job) };
    var ids = Object.keys(job.items).filter(function (k) { return job.items[k].status === 'pending' || job.items[k].status === 'running'; });
    if (!ids.length) { job.status = 'complete'; await jref.set(job); return { ok: true, job: summary(job) }; }
    var id = ids[0], item = job.items[id], sref = c.root.collection('sites').doc(id), snap = await sref.get();
    if (!snap.exists) { job.items[id] = { status: 'failed', error: 'Site no longer exists' }; return finishStep(c, jref, job, id, null); }
    var site = BR.normalize(id, snap.data() || {}), fcc = { keySet: !!(deps.env && deps.env.FCC_BB_KEY), left: 0 };
    if (fcc.keySet && item.partial && item.partial.phase === 'grid') {
      /* the FCC's lookups a day: counted before the network phase spends one */
      var cref = c.root.collection('site_jobs').doc('fcc_' + day(deps.now()));
      fcc.left = await c.db.runTransaction(async function (tx) { var cs = await tx.get(cref), n = cs.exists ? cs.data().count || 0 : 0; if (n >= G.FCC_DAILY_CAP) return 0; tx.set(cref, { count: n + 1, day: day(deps.now()) }, { merge: true }); return G.FCC_DAILY_CAP - n; });
    }
    var hd = deps.handlers(c.req), v = D.view(site, viewCtx(s));
    var r = await G.step(site, item.partial || null, { atlas: hd.atlas, network: hd.network, hosting: hd.hosting, fcc: fcc }, { now: deps.now(), unitKw: v.power.availableKw > 0 ? v.power.availableKw : null });
    if (!r.done) { job.items[id] = { status: 'running', partial: plain(r.screen) }; return finishStep(c, jref, job, id, r); }
    var landed = await c.db.runTransaction(async function (tx) {
      var cur = await tx.get(sref); if (!cur.exists) return null;
      var st = BR.normalize(id, cur.data() || {}), ch = D.change(st.diligence, 'screen', { screen: r.screen }, { site: st, config: s.config, role: s.role, canEdit: true, by: c.by, now: deps.now() });
      tx.update(sref, { diligence: plain(ch.diligence) });
      tx.create(c.db.collection('omega_audit').doc(), { action: 'sitecrm-diligence-screen', orgId: c.org, siteId: id, by: c.by, at: deps.now(), moved: ch.event.moved, errors: (r.screen.errors || []).length, jobId: job.id });
      return ch.event.moved;
    });
    job.items[id] = { status: r.screen.errors && r.screen.errors.length && !r.screen.located ? 'failed' : 'done', moved: landed || [], errors: (r.screen.errors || []).map(function (e) { return e.source; }) };
    return finishStep(c, jref, job, id, r);
  }
  async function finishStep(c, jref, job, id, r) {
    var vals = Object.keys(job.items).map(function (k) { return job.items[k].status; });
    job.done = vals.filter(function (x) { return x === 'done'; }).length; job.failed = vals.filter(function (x) { return x === 'failed'; }).length;
    job.status = vals.some(function (x) { return x === 'pending' || x === 'running'; }) ? 'paused' : 'complete'; job.updatedAt = deps.now();
    await jref.set(plain(job));
    return { ok: true, job: summary(job), site: id, phase: r ? r.phase : null, item: job.items[id] };
  }

  /* ── the LOI package ─────────────────────────────────────────────────── */
  async function loi(c, s) {
    var pk = s.config.offtake.partner && s.config.offtake.partner.key, partner = pk ? deps.partners.get(pk) : null;
    if (!pk) throw fail(409, 'No offtake partner is set for this workspace');
    if (!partner || partner.loiPackage !== true) throw fail(409, 'The workspace’s offtake partner (' + pk + ') does not take an LOI package');
    var settings = await c.db.collection('fin_settings').doc('dealroom').get(), rcpt = deps.partners.recipients(partner, deps.env || {}, settings.exists ? settings.data() : null);
    if (!rcpt.to.length) throw fail(409, partner.name + ' has no address on this deployment (' + partner.env + ', or fin_settings/dealroom.orgs.' + partner.settings + '). Nothing was sent.');
    var all = (await c.root.collection('sites').limit(SITE_SCAN).get()).docs.map(function (d) { return BR.normalize(d.id, d.data() || {}); });
    var sel = L.select(all, { config: s.config, now: deps.now() }, Array.isArray(c.b.ids) && c.b.ids.length ? c.b.ids : null);
    if (!sel.included.length) throw fail(409, 'No earmarked sites to send' + (sel.skipped.length ? ': ' + sel.skipped.slice(0, 5).map(function (x) { return (x.name || x.siteId) + ' (' + x.why + ')'; }).join('; ') : ''));
    var kases = {}; sel.included.forEach(function (st) { var k = caseFor(st, s.config, { ladder: false }); if (k) kases[st.siteId] = k; });
    var host = String((c.req && c.req.headers && c.req.headers.host) || '').replace(/[^A-Za-z0-9.:-]/g, '');
    var pkg = L.build(sel.included, { config: s.config, workspaceName: s.brand.name, partner: { key: partner.key, name: partner.name }, now: deps.now(), by: c.by, host: host, kases: kases, kwPerUnit: deps.kwPerUnit });
    var preq = c.root.collection('partner_requests').doc(pkg.packageId), cnt = c.root.collection('partner_requests').doc('loi_count_' + day(deps.now()));
    var claim = await c.db.runTransaction(async function (tx) {
      var p = await tx.get(preq), n = await tx.get(cnt), count = n.exists ? n.data().count || 0 : 0;
      /* nothing went out on a failed or unmailed package: it may be sent again; one sending or sent is the same package */
      if (p.exists && p.data().status !== 'failed' && p.data().status !== 'not-sent') return { duplicate: true, record: p.data() };
      if (count >= L.DAILY_CAP) throw fail(429, 'At most ' + L.DAILY_CAP + ' LOI packages a day from this workspace (' + count + ' today)');
      tx.set(preq, plain({ kind: 'loi-package', orgId: c.org, partner: partner.key, partnerName: partner.name, packageId: pkg.packageId, siteIds: pkg.siteIds, status: 'sending', by: c.by, at: deps.now() }));
      tx.set(cnt, { count: count + 1, day: day(deps.now()), updatedAt: deps.now() }, { merge: true });
      return { duplicate: false };
    });
    if (claim.duplicate) return { ok: true, duplicate: true, packageId: pkg.packageId, status: claim.record.status, note: 'This package was already ' + claim.record.status + ' today; nothing was sent again.' };
    var m = L.mail(pkg, { by: c.by, note: typeof c.b.note === 'string' ? c.b.note.slice(0, 1000) : null }), sent;
    try { sent = await deps.mail.send(rcpt.to.join(', '), m.subject, typeof deps.mail.layout === 'function' ? deps.mail.layout(m.subject, m.html) : m.html, null, { replyTo: c.by, cc: c.by }); }
    catch (e) { await preq.set({ status: 'failed', error: String(e && e.message || e).slice(0, 300), failedAt: deps.now() }, { merge: true }); throw fail(502, 'The LOI package to ' + partner.name + ' could not be sent: ' + (e && e.message || e)); }
    var status = sent && sent.skipped ? 'not-sent' : 'sent';
    await preq.set(plain({ status: status, to: rcpt.to, source: rcpt.source, sentAt: deps.now(), packet: pkg }), { merge: true });
    var moved = [], held = [];
    if (status === 'sent') {
      for (var i = 0; i < sel.included.length; i++) {
        var id = sel.included[i].siteId, sref = c.root.collection('sites').doc(id);
        try {
          await c.db.runTransaction(async function (tx) {
            var cur = await tx.get(sref), st = BR.normalize(id, cur.data() || {}), r = L.sent(st.diligence, pkg, { site: st, config: s.config, role: s.role, canEdit: true, by: c.by, now: deps.now(), to: rcpt.to });
            var patch = { diligence: plain(r.diligence) }; patch['partners.' + partner.key] = plain(r.partnerRecord);
            tx.update(sref, patch);
            tx.create(c.db.collection('omega_audit').doc(), { action: 'sitecrm-diligence-loi', orgId: c.org, siteId: id, by: c.by, at: deps.now(), partner: partner.key, packageId: pkg.packageId, to: rcpt.to });
          });
          moved.push(id);
        } catch (e) { held.push({ siteId: id, why: String(e && e.message || e).slice(0, 200) }); }
      }
    }
    return { ok: true, packageId: pkg.packageId, status: status, partner: { key: partner.key, name: partner.name }, to: rcpt.to, sites: pkg.totals.sites, moved: moved, held: held, skipped: sel.skipped,
      note: status === 'not-sent' ? 'No mailbox is configured on this server, so nothing was mailed and no site moved; the package is recorded.' : moved.length + ' site(s) sent to ' + partner.name + ' (' + rcpt.to.join(', ') + ') with you in copy; they read LOI sent.' + (held.length ? ' ' + held.length + ' changed meanwhile and did not move.' : '') };
  }

  /* ── the door ────────────────────────────────────────────────────────── */
  async function post(c) {
    var s = await scope(c), action = String(c.b.action || '');
    if (CHANGE[action]) { var input = Object.assign({}, c.b); delete input.org; delete input.site; delete input.action; return change(c, s, CHANGE[action], input); }
    if (action === 'diligence-screen-start') return screenStart(c, s);
    if (action === 'diligence-screen-step') return screenStep(c, s);
    if (action === 'diligence-loi') return loi(c, s);
    throw fail(400, 'Unknown diligence action');
  }
  /* one site's GET: null where the switch is off, so the page draws nothing */
  async function siteView(c, ref, data) {
    var billing = await billingOf(c.root);
    if (!D.enabled(billing)) return null;
    var cfg = D.configOf(billing), orgDoc = await c.root.get(), site = BR.normalize(ref.id, data || {});
    var files = filesOf(await kids(ref, 'files')), agreements = await kids(ref, 'agreements'), kase = caseFor(site, cfg);
    return { view: D.view(site, { config: cfg, now: deps.now(), files: files, agreements: agreements, kase: kase }), schema: D.schema(cfg), brand: D.brandOf(orgDoc.exists ? orgDoc.data() : null, c.org) };
  }
  /* the register's GET: a row a site, the strip and the tally; null where off */
  async function registerJoin(c, docs) {
    var billing = await billingOf(c.root);
    if (!D.enabled(billing)) return null;
    var cfg = D.configOf(billing), orgDoc = await c.root.get(), rows = {}, list = [];
    docs.forEach(function (d) {
      var site = BR.normalize(d.id, typeof d.data === 'function' ? d.data() : d), row = D.row(site, { config: cfg, now: deps.now(), kase: caseFor(site, cfg, { ladder: false }) });
      rows[d.id] = row; if (!site.archived) list.push(row);
    });
    return { rows: rows, pipeline: D.pipeline(list), tally: D.tally(list, cfg), schema: D.schema(cfg), brand: D.brandOf(orgDoc.exists ? orgDoc.data() : null, c.org) };
  }
  return { post: post, siteView: siteView, registerJoin: registerJoin, caseFor: caseFor };
}

/* the live instance: the real handlers in-process with the caller's own headers, the contract case where it is deployed */
function live() {
  var A = require('../admin'), OC = require('../omega-core'), cc = null;
  try { cc = require('../compute-contract').contractCase; } catch (e) { cc = null; }
  return make({ A: A, now: function () { return new Date().toISOString(); }, env: process.env, mail: require('../mail'), partners: require('../partners'), contractCase: cc,
    kwPerUnit: OC.RATE_CARD && OC.RATE_CARD.computeKwPerSkid,
    handlers: function (req) {
      var headers = (req && req.headers) || {};
      function bind(path, timeout) { return function (body) { return G.invoke(require(path), { method: 'POST', headers: headers, body: body, query: {} }, timeout); }; }
      return { atlas: bind('../../grid-atlas', G.TIMEOUT.grid), network: bind('../../network-proximity', G.TIMEOUT.network), hosting: bind('../../hosting-capacity', G.TIMEOUT.hosting) };
    } });
}
var instance = null;
function get() { if (!instance) instance = live(); return instance; }
module.exports = { ACTIONS: ACTIONS, owns: owns, make: make, chipKey: chipKey,
  post: function (c) { return get().post(c); }, siteView: function (c, ref, data) { return get().siteView(c, ref, data); }, registerJoin: function (c, docs) { return get().registerJoin(c, docs); } };
