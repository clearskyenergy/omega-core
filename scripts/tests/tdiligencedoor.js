/* scripts/tests/tdiligencedoor.js — the diligence's actions on the site CRM's
   door (api/_lib/portfolio/diligence-door.js), on the shared Firestore double.
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   Offline: the mail, the three Grid Atlas handlers and the contract case are
   stubs; every write goes through the double, which refuses an undefined
   value and a read after a write the way Firestore does. */
'use strict';
var assert = require('assert'), fs = require('fs'), path = require('path');
var ROOT = path.join(__dirname, '..', '..');
var FD = require('../_lib/firestore-double'), DOOR = require('../../api/_lib/portfolio/diligence-door'), D = require('../../api/_lib/portfolio/diligence'), PARTNERS = require('../../api/_lib/partners');
var SEED = JSON.parse(fs.readFileSync(path.join(ROOT, 'tenants/solelacapital/portfolio-diligence.json'), 'utf8'));
var ORG = 'solelacapital.com', O = 'omega_orgs/' + ORG, NOW = '2026-10-25T15:00:00.000Z', TOM = { uid: 'u-tom', email: 'tom@solelacapital.com', orgId: ORG, staff: false };
var passed = 0, failed = 0, queue = [];
function test(name, fn) { queue.push([name, fn]); }
function httpError(s, m) { var e = new Error(m); e.status = s; return e; }
async function rejects(p, status, re) { try { await p; } catch (e) { assert.equal(e.status, status, e.message); if (re) assert.ok(re.test(e.message), e.message); return e; } assert.fail('expected ' + status); }

function world(opts) {
  opts = opts || {};
  var db = new FD.DB(), mails = [], calls = { atlas: 0, network: 0, hosting: 0, cases: [] };
  db.seed(O, { name: 'Solela Capital LLC', status: 'active', vertical: 'developer', domains: ['solela.clearskyomega.com'], whiteLabel: opts.noWl ? undefined : { platformName: 'Solela Capital', shortName: 'Solela' } });
  if (opts.noWl) db.seed(O, { name: 'Solela Capital LLC', status: 'active' });
  db.seed(O + '/billing/current', Object.assign({ tier: 'enterprise', toolAccess: ['editor', 'gridatlas', 'computeproforma', 'vppsim'] }, opts.off ? { toolOverrides: {} } : { toolOverrides: { 'portfolio-diligence': true }, portfolioDiligence: D.validateConfig(SEED) }));
  db.seed(O + '/members/u-tom', { role: 'member', status: 'active', email: TOM.email });
  db.seed(O + '/sites/s1', { name: 'EV hub, I-80', address: { street: '1 Hub Rd', city: 'Des Moines', state: 'IA', zip: '50309' }, serviceCapacityKw: 800, existingPeakKw: 350, installedKw: 600, revision: 3, updatedAt: '2026-10-01T00:00:00.000Z' });
  db.seed(O + '/sites/s2', { name: 'Cold storage yard', address: { street: '9 Yard Ln', city: 'Waco', state: 'TX', zip: '76701' }, serviceCapacityKw: 1200, existingPeakKw: 825, revision: 1 });
  db.seed(O + '/sites/s1/files/f_ws', { name: 'will-serve.pdf', uploadState: 'stored', archived: false, category: 'contract' });
  db.seed(O + '/sites/s1/files/f_old', { name: 'old.pdf', uploadState: 'stored', archived: true });
  if (opts.lightsmith) db.seed('fin_settings/dealroom', { orgs: { lightsmith: [opts.lightsmith] } });
  var deps = { A: { httpError: httpError }, now: function () { return NOW; }, env: opts.env || {}, partners: PARTNERS, kwPerUnit: 75,
    mail: { send: function (to, subject, html, text, o) { mails.push({ to: to, subject: subject, html: html, opts: o }); return Promise.resolve(opts.mailSkipped ? { skipped: true } : { ok: true }); }, layout: function (t, h) { return '<html>' + h + '</html>'; } },
    contractCase: opts.noCase ? null : function (input, o) { calls.cases.push({ input: input, opts: o }); return { ok: true, priced: input.contract && input.contract.pricePerGpuHour != null, chipset: { key: 'h100', name: 'NVIDIA H100' },
      contract: { termMonths: input.contract.termMonths, pricePerGpuHour: input.contract.pricePerGpuHour == null ? null : input.contract.pricePerGpuHour, takeOrPayPct: 100 }, partner: { name: 'Lightsmith Energy', feePct: 10 },
      sizing: { units: Math.floor((input.availableKw || 75) / 75), gpus: 48 * Math.floor((input.availableKw || 75) / 75), itKw: 75 * Math.floor((input.availableKw || 75) / 75), byChipset: [] },
      capex: { total: 764000 * Math.floor((input.availableKw || 75) / 75) }, returns: input.contract && input.contract.pricePerGpuHour != null ? { projectIrrPct: 54.2, roiPct: 189, paybackMonths: 26, projectMultiple: 2.89 } : null,
      ladder: o && o.ladder === false ? null : [{ price: 2, projectIrrPct: 54.2, paybackMonths: 26 }],
      ladderBasis: { centre: 2, centreBasis: input.contract && input.contract.pricePerGpuHour != null ? 'contract' : 'spot', referencePricePerGpuHour: 2 } }; },
    handlers: function () {
      return { atlas: function () { calls.atlas++; return Promise.resolve({ status: 200, body: { lat: 41.6, lng: -93.6, geocode: { precision: 'exact' }, substations: [{ name: 'Bondurant', distanceKm: 2.25, voltageKv: 69 }], sources: { substations: 'HIFLD' } } }); },
        network: function () { calls.network++; return Promise.resolve({ status: 200, body: { fcc: { status: 'skipped', providers: [] }, facilities: { status: 'ok', nearestMajor: { name: 'DSM IX', mi: 6 } }, fiber: { lateral: { mi: 2.1, to: 'DSM IX' } } } }); },
        hosting: function () { calls.hosting++; return Promise.resolve({ status: 200, body: { utility: { key: 'midamerican', display: 'MidAmerican Energy' }, coverage: 'none' } }); } };
    } };
  var door = DOOR.make(deps);
  function ctx(b, extra) { return Object.assign({ db: db, org: ORG, root: db.collection('omega_orgs').doc(ORG), caller: TOM, by: TOM.email, b: b, site: b.site || null, canEdit: true, req: { headers: { host: 'solela.clearskyomega.com', authorization: 'Bearer t' } } }, extra || {}); }
  function audits(a) { var n = []; db.data.forEach(function (v, k) { if (k.indexOf('omega_audit/') === 0 && v.action === a) n.push(v); }); return n; }
  return { db: db, door: door, ctx: ctx, mails: mails, calls: calls, audits: audits, site: function (id) { return db.data.get(O + '/sites/' + id); },
    post: function (b, extra) { return door.post(ctx(b, extra)); } };
}

test('Q01 switched off: every action refuses with 403, and the GETs carry nothing, so the pages draw nothing new', async function () {
  var w = world({ off: true });
  for (var i = 0; i < DOOR.ACTIONS.length; i++) await rejects(w.post({ action: DOOR.ACTIONS[i], site: 's1', ids: ['s1'] }), 403, /not switched on/);
  assert.equal(await w.door.siteView(w.ctx({}), w.db.collection('omega_orgs').doc(ORG).collection('sites').doc('s1'), w.site('s1')), null);
  assert.equal(await w.door.registerJoin(w.ctx({}), [{ id: 's1', data: function () { return w.site('s1'); } }]), null);
  assert.equal(w.audits('sitecrm-diligence-decide').length, 0);
  assert.ok(DOOR.owns('diligence-gate') && !DOOR.owns('site-save') && !DOOR.owns('send-to-partner'));
});

test('Q02 a MEMBER earmarks, passes and edits; each change is the site’s diligence only, audited, never a fact change', async function () {
  var w = world(), r = await w.post({ action: 'diligence-decide', site: 's1', choice: 'pursue' });
  assert.equal(r.ok, true); assert.equal(r.diligence.stage, 'pursue'); assert.equal(r.diligence.stageLabel, 'Earmarked');
  var s = w.site('s1');
  assert.equal(s.diligence.decision.by, 'tom@solelacapital.com'); assert.equal(s.revision, 3, 'the facts’ revision is not bumped'); assert.equal(s.updatedAt, '2026-10-01T00:00:00.000Z', 'nor updatedAt: the compute model must not run again on it');
  var a = w.audits('sitecrm-diligence-decide'); assert.equal(a.length, 1); assert.equal(a[0].siteId, 's1'); assert.equal(a[0].what, 'decision');
  assert.equal((await w.post({ action: 'diligence-decide', site: 's1', choice: 'pursue' })).unchanged, true); assert.equal(w.audits('sitecrm-diligence-decide').length, 1, 'a repeat writes nothing');
  await w.post({ action: 'diligence-profile', site: 's1', intakeType: 'operating-charging', hostDeal: 'ground-lease' });
  await w.post({ action: 'diligence-chargers', site: 's1', count: 12, status: 'operating', use: 'public', peak: { kw: 350, source: 'bill' } });
  await w.post({ action: 'diligence-control', site: 's1', route: 'lease', lease: { rentMonthlyUsd: 11250, termYears: 15, startDate: '2026-11-01', computePermitted: true } });
  await w.post({ action: 'diligence-offtake', site: 's1', loiStatus: 'drafted' });
  s = w.site('s1'); assert.equal(s.diligence.intakeType, 'operating-charging'); assert.equal(s.diligence.chargers.count, 12); assert.equal(s.diligence.control.route, 'lease');
  await rejects(w.post({ action: 'diligence-decide', site: 's1', choice: 'pass', reason: 'x' }), 400, /reason/);
  await rejects(w.post({ action: 'diligence-gate', site: 's1', gate: 'power', state: 'open' }, { canEdit: false }), 403, /read the diligence/);
  await rejects(w.post({ action: 'diligence-decide', choice: 'pursue' }), 400, /Which site/);
  await rejects(w.post({ action: 'diligence-decide', site: 'nope', choice: 'pursue' }), 404);
});

test('Q03 confirmed needs a document on the site’s own Files: none, an archived one or another site’s is refused; the will-serve on file confirms', async function () {
  var w = world();
  await rejects(w.post({ action: 'diligence-gate', site: 's1', gate: 'power', state: 'confirmed', value: { willServeKw: 750 }, source: { kind: 'document', doc: 'will-serve' } }), 400, /document on the site/);
  await rejects(w.post({ action: 'diligence-gate', site: 's1', gate: 'power', state: 'confirmed', value: { willServeKw: 750 }, evidenceFileId: 'f_old', source: { kind: 'document', doc: 'will-serve' } }), 409, /archived/);
  await rejects(w.post({ action: 'diligence-gate', site: 's2', gate: 'power', state: 'confirmed', value: { willServeKw: 750 }, evidenceFileId: 'f_ws', source: { kind: 'document', doc: 'will-serve' } }), 409, /not on this site/);
  var r = await w.post({ action: 'diligence-gate', site: 's1', gate: 'power', state: 'confirmed', value: { willServeKw: 750 }, evidenceFileId: 'f_ws', source: { kind: 'document', doc: 'will-serve' } });
  assert.equal(r.diligence.gates.power.state, 'confirmed'); assert.equal(w.audits('sitecrm-diligence-gate').length, 1);
  assert.equal(w.audits('sitecrm-diligence-gate')[0].to, 'confirmed');
});

test('Q04 one site’s GET: the view, the schema, and the name the page prints (the white label’s, else the workspace’s); the contract case run on the site’s own terms', async function () {
  var w = world(), ref = w.db.collection('omega_orgs').doc(ORG).collection('sites').doc('s1');
  await w.post({ action: 'diligence-offtake', site: 's1', pricePerGpuHour: 2.0, takeOrPayPct: 80 });
  var g = await w.door.siteView(w.ctx({}), ref, w.site('s1'));
  assert.equal(g.brand.name, 'Solela Capital'); assert.equal(g.brand.shortName, 'Solela'); assert.equal(g.schema.stageLabels.pursue, 'Earmarked');
  assert.equal(g.view.power.availableKw, 450); assert.equal(g.view.economics.source, 'contract-case'); assert.equal(g.view.economics.irrPct, 54.2); assert.ok(g.view.lines.power.sentence.indexOf('450 kW free') >= 0);
  var last = w.calls.cases[w.calls.cases.length - 1].input;
  assert.equal(last.availableKw, 450); assert.equal(last.contract.pricePerGpuHour, 2); assert.equal(last.contract.termMonths, 72); assert.equal(last.contract.takeOrPayPct, 80);
  assert.deepEqual(last.contract.partner, { name: 'Lightsmith Energy', feePct: 10 });
  var n = world({ noWl: true }), g2 = await n.door.siteView(n.ctx({}), n.db.collection('omega_orgs').doc(ORG).collection('sites').doc('s1'), n.site('s1'));
  assert.equal(g2.brand.name, 'Solela Capital LLC', 'no white label: the workspace’s own name');
  var nc = world({ noCase: true }), g3 = await nc.door.siteView(nc.ctx({}), nc.db.collection('omega_orgs').doc(ORG).collection('sites').doc('s1'), nc.site('s1'));
  assert.equal(g3.view.economics.source, null, 'no contract case deployed: the record’s own figures, here none');
  /* nothing to size on: no case is run on nothing */
  w.db.seed(O + '/sites/s3', { name: 'No facts' }); var before = w.calls.cases.length;
  await w.door.siteView(w.ctx({}), w.db.collection('omega_orgs').doc(ORG).collection('sites').doc('s3'), w.site('s3'));
  assert.equal(w.calls.cases.length, before);
});

test('Q05 the register: a row a site, the pipeline strip and the tally under the workspace’s name', async function () {
  var w = world();
  await w.post({ action: 'diligence-decide', site: 's1', choice: 'pursue' });
  var docs = ['s1', 's2'].map(function (id) { return { id: id, data: function () { return w.site(id); } }; }), j = await w.door.registerJoin(w.ctx({}), docs);
  assert.equal(j.rows.s1.stage, 'pursue'); assert.equal(j.rows.s2.stage, 'brought-in'); assert.equal(j.rows.s1.freeKw, 450);
  var n = {}; j.pipeline.forEach(function (x) { n[x.stage] = x.count; }); assert.equal(n.pursue, 1); assert.equal(n['brought-in'], 1);
  /* no contract price: the register's fast path keeps the ladder, so the column reads the IRR at spot, marked */
  assert.equal(j.rows.s1.irrPct, null); assert.equal(j.rows.s1.irrAtPct, 54.2); assert.equal(j.rows.s1.irrAtBasis, 'spot');
  assert.equal(j.tally.sites, 1); assert.equal(j.tally.target.minUsd, 25000000); assert.equal(j.brand.name, 'Solela Capital');
  assert.ok(w.calls.cases.every(function (c) { return !(c.opts && c.opts.ladder === false); }), 'unpriced: every register case keeps its ladder, where the at-spot figure lives');
  /* once a price is set, the register's fast path asks that site's case for no ladder, and its own IRR replaces the reference */
  await w.post({ action: 'diligence-offtake', site: 's2', pricePerGpuHour: 2 });
  var b4 = w.calls.cases.length, jp = await w.door.registerJoin(w.ctx({}), docs);
  assert.ok(w.calls.cases.slice(b4).some(function (c) { return c.input.contract.pricePerGpuHour === 2 && c.opts && c.opts.ladder === false; }), 'a priced site asks for no ladder');
  assert.ok(w.calls.cases.slice(b4).some(function (c) { return c.input.contract.pricePerGpuHour == null && !(c.opts && c.opts.ladder === false); }), 'an unpriced one keeps it');
  assert.equal(jp.rows.s2.irrPct, 54.2); assert.equal(jp.rows.s2.irrAtPct, null);
  /* the case runs only where a figure needs it: the page's rows, and an earmarked site off the page for the tally; never a site that is neither */
  w.db.seed(O + '/sites/s3', { name: 'Third site', serviceCapacityKw: 2000, existingPeakKw: 500 });
  var before = w.calls.cases.length, j2 = await w.door.registerJoin(w.ctx({}), [{ id: 's2', data: function () { return w.site('s2'); } }]);
  var sized = w.calls.cases.slice(before).map(function (c) { return c.input.availableKw; }).sort(function (x, y) { return x - y; });
  assert.deepEqual(sized, [375, 450], 's2 on the page (375 kW free) and the earmarked s1 (450 kW) are cased; s3 (1,500 kW), neither, is not');
  assert.equal(j2.tally.sites, 1); assert.equal(j2.tally.capexUsd, 764000 * 6, 'the earmarked site off the page still carries its capex into the tally'); assert.equal(j2.tally.units, 6);
  var m = {}; j2.pipeline.forEach(function (x) { m[x.stage] = x.count; }); assert.equal(m['brought-in'], 2, 'the strip counts every site, cased or not');
});

test('Q06 the Grid Atlas screen: a job a phase at a time; the screen lands and power reads screened; a fresh screen is not run again; the FCC count when the key is set', async function () {
  var w = world(), st = await w.post({ action: 'diligence-screen-start', ids: ['s1', 's2'] });
  assert.equal(st.job.total, 2); assert.equal(st.job.status, 'paused'); assert.equal(w.audits('sitecrm-diligence-screen-start').length, 1);
  var steps = 0, r;
  do { r = await w.post({ action: 'diligence-screen-step', jobId: st.job.id }); steps++; } while (r.job.status !== 'complete' && steps < 10);
  assert.equal(steps, 4, 'two phases for each of two sites'); assert.equal(r.job.done, 2);
  assert.equal(w.calls.atlas, 2); assert.equal(w.calls.network, 2); assert.equal(w.calls.hosting, 2);
  var s1 = w.site('s1');
  assert.equal(s1.diligence.screen.power.kv, 69); assert.equal(s1.diligence.gates.power.state, 'screened'); assert.equal(s1.diligence.screen.fiber.carriersStatus, 'needs-key');
  assert.equal(w.audits('sitecrm-diligence-screen').length, 2);
  var again = await w.post({ action: 'diligence-screen-start', ids: ['s1', 's2'] });
  assert.deepEqual(again.skippedFresh.sort(), ['s1', 's2']); assert.equal(again.job.total, 0); assert.equal(again.job.status, 'complete');
  await rejects(w.post({ action: 'diligence-screen-start', ids: [] }), 400);
  await rejects(w.post({ action: 'diligence-screen-step', jobId: 'nope' }), 404);
  /* with the key set, each network phase counts one FCC lookup for the day */
  var k = world({ env: { FCC_BB_KEY: 'k' } }), sk = await k.post({ action: 'diligence-screen-start', ids: ['s1'] });
  await k.post({ action: 'diligence-screen-step', jobId: sk.job.id }); await k.post({ action: 'diligence-screen-step', jobId: sk.job.id });
  assert.equal(k.db.data.get(O + '/site_jobs/fcc_2026-10-25').count, 1);
  k.db.seed(O + '/site_jobs/fcc_2026-10-25', { count: 999 });
  var sk2 = await k.post({ action: 'diligence-screen-start', ids: ['s2'] });
  await k.post({ action: 'diligence-screen-step', jobId: sk2.job.id }); await k.post({ action: 'diligence-screen-step', jobId: sk2.job.id });
  assert.equal(k.site('s2').diligence.screen.fiber.carriersStatus, 'limit'); assert.equal(k.calls.network, 1, 'the allowance used up: the network check was not called');
});

test('Q07 the LOI package: no address is 409 and nothing mailed; with one, ONE mail for the earmarked set, each site to LOI sent with the partner record; a second press the same day sends nothing; an unconfigured mailbox moves nothing', async function () {
  var w = world();
  await w.post({ action: 'diligence-decide', site: 's1', choice: 'pursue' }); await w.post({ action: 'diligence-decide', site: 's2', choice: 'pursue' });
  await rejects(w.post({ action: 'diligence-loi' }), 409, /no address on this deployment \(LIGHTSMITH_ENERGY_EMAIL/);
  assert.equal(w.mails.length, 0);
  var m = world({ env: { LIGHTSMITH_ENERGY_EMAIL: 'deals@lightsmith.example' } });
  await m.post({ action: 'diligence-decide', site: 's1', choice: 'pursue' }); await m.post({ action: 'diligence-decide', site: 's2', choice: 'pursue' });
  var r = await m.post({ action: 'diligence-loi', note: 'Two sites to start' });
  assert.equal(r.status, 'sent'); assert.deepEqual(r.moved.sort(), ['s1', 's2']); assert.equal(m.mails.length, 1);
  assert.equal(m.mails[0].to, 'deals@lightsmith.example'); assert.equal(m.mails[0].opts.cc, 'tom@solelacapital.com'); assert.ok(/^\[Solela Capital\] LOI package for Lightsmith Energy: 2 sites/.test(m.mails[0].subject), m.mails[0].subject);
  assert.ok(!/54\.2|764000|irr/i.test(m.mails[0].html), 'the mail carries no IRR or capex');
  var s1 = m.site('s1'); assert.equal(s1.diligence.stage, 'loi-sent'); assert.equal(s1.diligence.offtake.loiStatus, 'sent'); assert.equal(s1.partners.lightsmith.status, 'sent'); assert.equal(s1.partners.lightsmith.packageId, r.packageId);
  assert.equal(m.db.data.get(O + '/partner_requests/' + r.packageId).status, 'sent'); assert.equal(m.audits('sitecrm-diligence-loi').length, 2);
  await rejects(m.post({ action: 'diligence-loi', ids: ['s1', 's2'] }), 409, /already past the LOI \(LOI sent\)/);
  assert.equal(m.mails.length, 1, 'nothing is mailed twice');
  /* a package still in flight is the same package: a second press waits for it */
  var f = world({ env: { LIGHTSMITH_ENERGY_EMAIL: 'deals@lightsmith.example' } });
  await f.post({ action: 'diligence-decide', site: 's1', choice: 'pursue' });
  var probe = await f.door.post(f.ctx({ action: 'diligence-loi' })); f.mails.length = 0;
  f.db.seed(O + '/sites/s1', Object.assign({}, f.site('s1'), { diligence: Object.assign({}, f.site('s1').diligence, { stage: 'pursue', offtake: { loiStatus: 'none' } }) }));
  f.db.seed(O + '/partner_requests/' + probe.packageId, { status: 'sending' });
  var dup = await f.post({ action: 'diligence-loi' });
  assert.equal(dup.duplicate, true); assert.equal(f.mails.length, 0); assert.ok(/already sending/.test(dup.note));
  /* the mailbox not configured: recorded, no site moves */
  var q = world({ lightsmith: 'loi@lightsmith.example', mailSkipped: true });
  await q.post({ action: 'diligence-decide', site: 's1', choice: 'pursue' });
  var rq = await q.post({ action: 'diligence-loi' });
  assert.equal(rq.status, 'not-sent'); assert.deepEqual(rq.moved, []); assert.equal(q.site('s1').diligence.stage, 'pursue'); assert.ok(/nothing was mailed and no site moved/.test(rq.note));
  var rq2 = await q.post({ action: 'diligence-loi' });
  assert.equal(rq2.duplicate, undefined, 'nothing went out: the same package may be sent again'); assert.equal(rq2.status, 'not-sent');
  /* the daily cap */
  var c = world({ env: { LIGHTSMITH_ENERGY_EMAIL: 'deals@lightsmith.example' } });
  await c.post({ action: 'diligence-decide', site: 's1', choice: 'pursue' }); c.db.seed(O + '/partner_requests/loi_count_2026-10-25', { count: 5 });
  await rejects(c.post({ action: 'diligence-loi' }), 429, /At most 5 LOI packages a day/);
});

test('Q09 clients: a member records the paperwork in one call, audited; one client a site, the register\u2019s other portfolios untouched; each client joins the register with its own strip and tally; the site\u2019s view and card choices carry it', async function () {
  var w = world();
  /* a register portfolio that is NOT a client stays what it was */
  w.db.seed(O + '/site_portfolios/p_plain', { name: 'Texas saved set', createdAt: NOW, createdBy: 'x' });
  w.db.seed(O + '/sites/s1', Object.assign({}, w.site('s1'), { portfolioIds: ['p_plain'] }));
  var mk = await w.post({ action: 'diligence-client', name: 'Acme Charging', company: 'Acme Charging LLC', contactEmail: 'pat@acme.example', steps: { nda: { state: 'signed', date: '2026-10-20' }, msa: { state: 'sent', date: '2026-10-22' } } });
  assert.equal(mk.ok, true); assert.ok(mk.portfolioId); assert.equal(mk.client.name, 'Acme Charging'); assert.equal(mk.client.signed, 1);
  var a1 = w.audits('sitecrm-diligence-client'); assert.equal(a1.length, 1); assert.ok(/client:nda:signed/.test(a1[0].what), a1[0].what);
  var pid = mk.portfolioId;
  assert.equal((await w.post({ action: 'diligence-client', portfolioId: pid, steps: { msa: { state: 'sent', date: '2026-10-22' } } })).unchanged, true);
  assert.equal(w.audits('sitecrm-diligence-client').length, 1, 'a repeat writes nothing');
  await rejects(w.post({ action: 'diligence-client', name: 'X' }, { canEdit: false }), 403, /read the diligence/);
  await rejects(w.post({ action: 'diligence-client', portfolioId: 'nope', steps: {} }), 404, /No such client/);
  await rejects(w.post({ action: 'diligence-client', portfolioId: 'p_plain', name: 'Y' }), 409, /not a client/);
  /* assign: one client a site; the plain portfolio membership is kept */
  var as1 = await w.post({ action: 'diligence-assign', portfolioId: pid, sites: ['s1', 's2'] });
  assert.equal(as1.assigned, 2); assert.ok(/under Acme Charging/.test(as1.note));
  assert.deepEqual(w.site('s1').portfolioIds, ['p_plain', pid]);
  var mk2 = await w.post({ action: 'diligence-client', name: 'Northgate REIT' }), pid2 = mk2.portfolioId;
  await w.post({ action: 'diligence-assign', portfolioId: pid2, site: 's1' });
  assert.deepEqual(w.site('s1').portfolioIds, ['p_plain', pid2], 'reassigned: the old client pid goes, the plain portfolio stays');
  await rejects(w.post({ action: 'diligence-assign', portfolioId: pid, site: 'ghost' }), 404, /Site not found/);
  var bulk = await w.post({ action: 'diligence-assign', portfolioId: pid, sites: ['s1', 'ghost'] });
  assert.deepEqual(bulk.missing, ['ghost'], 'a bulk assignment skips and names what is not there');
  await w.post({ action: 'diligence-assign', portfolioId: null, sites: ['s2'] });
  assert.deepEqual(w.site('s2').portfolioIds, [], 'taken off their client');
  await w.post({ action: 'diligence-decide', site: 's1', choice: 'pursue' });
  /* the register: rows carry the client; each client joins with its own strip and tally; the unassigned are counted */
  var docs = ['s1', 's2'].map(function (id) { return { id: id, data: function () { return w.site(id); } }; }), j = await w.door.registerJoin(w.ctx({}), docs);
  assert.equal(j.rows.s1.clientId, pid); assert.equal(j.rows.s1.clientName, 'Acme Charging'); assert.equal(j.rows.s2.clientId, null);
  assert.equal(j.unassigned, 1);
  var acme = j.clients.filter(function (x) { return x.id === pid; })[0];
  assert.equal(acme.sites, 1); assert.equal(acme.client.next.step, 'msa');
  var n = {}; acme.pipeline.forEach(function (x) { n[x.stage] = x.count; }); assert.equal(n.pursue, 1);
  assert.equal(acme.tally.sites, 1);
  assert.ok(!j.clients.some(function (x) { return x.id === 'p_plain'; }), 'a plain portfolio is not a client card');
  /* one site: the view carries the client and the NDA stands; the card gets the choosable clients */
  var g = await w.door.siteView(w.ctx({}), w.db.collection('omega_orgs').doc(ORG).collection('sites').doc('s1'), w.site('s1'));
  assert.equal(g.view.client.name, 'Acme Charging');
  assert.ok(g.view.flags.every(function (f) { return f.code !== 'CLIENT_NDA'; }), 'NDA signed: no flag');
  assert.deepEqual(g.clients.map(function (x) { return x.name; }).sort(), ['Acme Charging', 'Northgate REIT']);
  var g2 = await w.door.siteView(w.ctx({}), w.db.collection('omega_orgs').doc(ORG).collection('sites').doc('s2'), w.site('s2'));
  assert.equal(g2.view.client, null);
  /* a change answers with the client riding the view */
  var ch = await w.post({ action: 'diligence-profile', site: 's1', hostDeal: 'ground-lease' });
  assert.equal(ch.diligence.client.name, 'Acme Charging');
});

test('Q08 the chip key the contract case reads, from what a person typed', function () {
  assert.equal(DOOR.chipKey('NVIDIA H100'), 'h100'); assert.equal(DOOR.chipKey('H200'), 'h200'); assert.equal(DOOR.chipKey('GB200 NVL72'), 'gb200nvl72'); assert.equal(DOOR.chipKey(''), null);
  var src = fs.readFileSync(path.join(ROOT, 'api/_lib/portfolio/diligence-door.js'), 'utf8');
  assert.ok(src.indexOf('© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.') > 0);
  assert.ok(!/Solela|Lightsmith/.test(src.replace(/\/\*[\s\S]*?\*\//g, '')), 'no workspace or partner named in the door');
});

(async function () {
  for (var i = 0; i < queue.length; i++) {
    try { await queue[i][1](); passed++; console.log('PASS ' + queue[i][0]); }
    catch (e) { failed++; console.log('FAIL ' + queue[i][0] + '\n     ' + (e && e.stack || e).split('\n').slice(0, 5).join('\n     ')); }
  }
  console.log('diligence door: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})();
