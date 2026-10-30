/* scripts/tests/tloipackage.js — ONE letter-of-intent package for the offtake
   partner (api/_lib/portfolio/loi-package.js) and the partner it goes to
   (api/_lib/partners.js). © 2025–2026 ClearSky Energy Solutions LLC.
   Proprietary and Confidential. Pure: nothing is mailed. */
'use strict';
var assert = require('assert'), fs = require('fs'), path = require('path');
var ROOT = path.join(__dirname, '..', '..');
var L = require('../../api/_lib/portfolio/loi-package'), D = require('../../api/_lib/portfolio/diligence'), PARTNERS = require('../../api/_lib/partners');
var SEED = JSON.parse(fs.readFileSync(path.join(ROOT, 'tenants/solelacapital/portfolio-diligence.json'), 'utf8'));
var CFG = D.normalizeConfig(D.validateConfig(SEED)), NOW = '2026-10-25T15:00:00.000Z', BY = 'tom@solelacapital.com';
var passed = 0, failed = 0, queue = [];
function test(name, fn) { queue.push([name, fn]); }
function ctx(extra) { return Object.assign({ config: CFG, now: NOW, by: BY, role: 'member', canEdit: true, files: [], agreements: [] }, extra || {}); }
function refused(fn, status, re) { try { fn(); } catch (e) { assert.equal(e.status, status, e.message); if (re) assert.ok(re.test(e.message), e.message); return e; } assert.fail('expected ' + status); }
function site(id, extra, steps) {
  var s = Object.assign({ siteId: id, name: 'Site ' + id, address: { street: id + ' Main St', city: 'Des Moines', state: 'IA', zip: '50309' }, serviceCapacityKw: 800, existingPeakKw: 350, installedKw: 600 }, extra || {});
  (steps || []).forEach(function (st) { var r = D.change(s.diligence, st[0], st[1], ctx({ site: s })); if (!r.unchanged) s.diligence = r.diligence; });
  return s;
}
function earmarked(id, extra, more) { return site(id, extra, [['decide', { choice: 'pursue' }]].concat(more || [])); }
var PARTNER = PARTNERS.get('lightsmith');

test('P01 Lightsmith is a partner the Terra way: its address from the environment or the deal room\'s list, never a constant; none is none', function () {
  assert.ok(PARTNER); assert.equal(PARTNER.name, 'Lightsmith Energy'); assert.equal(PARTNER.env, 'LIGHTSMITH_ENERGY_EMAIL'); assert.equal(PARTNER.settings, 'lightsmith'); assert.equal(PARTNER.loiPackage, true); assert.equal(PARTNER.role, 'offtake');
  assert.deepEqual(PARTNERS.recipients('lightsmith', {}, {}), { to: [], source: null });
  assert.deepEqual(PARTNERS.recipients('lightsmith', { LIGHTSMITH_ENERGY_EMAIL: 'deals@lightsmith.example; max@lightsmith.example' }, {}), { to: ['deals@lightsmith.example', 'max@lightsmith.example'], source: 'LIGHTSMITH_ENERGY_EMAIL' });
  assert.deepEqual(PARTNERS.recipients('lightsmith', {}, { orgs: { lightsmith: ['loi@lightsmith.example', 'not an address'] } }).to, ['loi@lightsmith.example']);
  var src = fs.readFileSync(path.join(ROOT, 'api/_lib/partners.js'), 'utf8');
  assert.ok(!/@[a-z0-9-]+\.(com|energy|io|net)\b/i.test(src.replace(/\/\*[\s\S]*?\*\//g, '')), 'no address in the code');
  assert.ok(!/\b10%|\bfeePct\b|\btermYears\b/.test(src.replace(/\/\*[\s\S]*?\*\//g, '')), 'the fee and term are a workspace\'s config, not the partner record');
  assert.equal(PARTNERS.list().filter(function (p) { return p.key === 'lightsmith'; })[0].loiPackage, true);
  assert.equal(PARTNERS.list().filter(function (p) { return p.key === 'terra'; })[0].loiPackage, false, 'Terra keeps its one-site mail');
});

test('P02 which sites go: the earmarked; a chosen site that is not is named and stays home', function () {
  var a = earmarked('a'), b = earmarked('b'), n = site('n'), p = site('p', {}, [['decide', { choice: 'pass', reason: 'Too small for a skid' }]]);
  var l = site('l', {}, [['decide', { choice: 'pursue' }], ['offtake', { loiStatus: 'sent' }], ['stage', { stage: 'loi-sent' }]]), x = earmarked('x');
  x.hostType = 'multifamily';   /* earmarked first, then its host type corrected: the rule passes it */
  var all = L.select([a, b, n, p, l, x], { config: CFG, now: NOW });
  assert.deepEqual(all.included.map(function (s) { return s.siteId; }), ['a', 'b'], 'an excluded site is passed by the rule, even with an earmark under it');
  assert.deepEqual(all.skipped.map(function (s) { return s.siteId + ':' + s.why; }), ['l:already past the LOI (LOI sent)']);
  var some = L.select([a, b, n, p, l], { config: CFG, now: NOW }, ['a', 'n', 'p', 'zz']);
  assert.deepEqual(some.included.map(function (s) { return s.siteId; }), ['a']);
  assert.deepEqual(some.skipped.map(function (s) { return s.siteId + ':' + s.why; }), ['n:not earmarked (Brought in)', 'p:passed', 'zz:not in this workspace']);
  var arch = earmarked('r', { archived: true });
  assert.deepEqual(L.select([arch], { config: CFG, now: NOW }, ['r']).skipped[0].why, 'archived');
});

test('P03 the package: each site\'s power, compute, chips, fiber and control with its term; the totals and the chip mix; never the workspace\'s IRR, capex or price', function () {
  var a = earmarked('a', { latestModel: { irr: 0.31, moic: 2.8, totalProjectCost: 4584000, skid: { units: 6, chipset: 'h100', chipsetName: 'NVIDIA H100', gpus: 288 }, pods: 6 } },
    [['control', { route: 'lease', lease: { termYears: 4, startDate: '2026-11-01', computePermitted: true } }], ['gate', { gate: 'fiber', state: 'screened', source: { kind: 'public', name: 'FCC broadband data' }, value: { carriers: ['Lumen', 'Zayo'], symmetric1g: true } }]]);
  var b = earmarked('b', { serviceCapacityKw: 1200, existingPeakKw: 825, latestDesign: { compute: { units: 5, omegaCoreUnits: 5, kwIt: 375 } } }, [['control', { route: 'own', own: { entity: 'Solela Sites I LLC' } }]]);
  var c = earmarked('c', { existingPeakKw: null });
  var pkg = L.build([a, b, c], ctx({ workspaceName: 'Solela Capital', partner: { key: PARTNER.key, name: PARTNER.name }, host: 'solelacapital.clearskyomega.com', kwPerUnit: 75 }));
  assert.equal(pkg.partner.name, 'Lightsmith Energy'); assert.equal(pkg.workspace, 'Solela Capital'); assert.equal(pkg.termYears, 6);
  assert.equal(pkg.totals.sites, 3); assert.equal(pkg.totals.availableKw, 450 + 375); assert.equal(pkg.totals.availableKnown, 2); assert.equal(pkg.totals.availableMw, 0.825);
  assert.equal(pkg.totals.units, 11); assert.equal(pkg.totals.unitsKnown, 2); assert.equal(pkg.totals.computeKw, 450 + 375); assert.equal(pkg.totals.computeMw, 0.825);
  assert.deepEqual(pkg.totals.chipMix.map(function (m) { return (m.chipset || '-') + ':' + m.sites + ':' + m.units; }), ['NVIDIA H100:1:6', '-:2:5']);
  var ra = pkg.sites[0], rb = pkg.sites[1], rc = pkg.sites[2];
  assert.equal(ra.power.availableKw, 450); assert.equal(ra.compute.units, 6); assert.equal(ra.compute.unitsLabel, 'Omega-Core skids'); assert.equal(ra.compute.basis, 'the compute model'); assert.equal(ra.compute.computeKw, 450, 'units × the product record’s kW, handed in');
  assert.deepEqual(ra.fiber.carriers, ['Lumen', 'Zayo']); assert.equal(ra.fiber.symmetric1g, true);
  assert.equal(ra.control.route, 'lease'); assert.equal(ra.control.end, '2030-11-01'); assert.equal(ra.control.ok, false); assert.ok(ra.control.shortMonths > 0, 'a lease shorter than the offtake term is said in the package');
  assert.equal(rb.compute.basis, 'the Site Map design'); assert.equal(rb.compute.computeKw, 375); assert.equal(rb.control.perpetual, true);
  assert.equal(rc.power.availableKw, null, 'no measured peak: not on file, never the nameplate'); assert.equal(rc.compute.units, null);
  assert.equal(ra.link, 'https://solelacapital.clearskyomega.com/site-crm.html?site=a#diligence');
  var json = JSON.stringify(pkg);
  ['irr', 'Irr', 'capex', 'totalProjectCost', 'pricePerGpuHour', 'moic', '4584000', 'investorCapital'].forEach(function (w) { assert.ok(json.indexOf(w) < 0, 'the package carries ' + w); });
  /* the same set the same day is the same package; another day, another */
  var again = L.build([c, b, a], ctx({ workspaceName: 'Solela Capital', partner: { key: PARTNER.key, name: PARTNER.name } }));
  assert.equal(again.packageId, pkg.packageId); assert.ok(/^loi_20261025_[0-9a-f]{8}$/.test(pkg.packageId));
  assert.notEqual(L.build([a, b, c], ctx({ now: '2026-10-26T09:00:00.000Z', partner: { key: 'lightsmith', name: 'Lightsmith Energy' } })).packageId, pkg.packageId);
  assert.notEqual(L.build([a, b], ctx({ partner: { key: 'lightsmith', name: 'Lightsmith Energy' } })).packageId, pkg.packageId);
  refused(function () { L.build([], ctx({ partner: { key: 'lightsmith', name: 'L' } })); }, 409, /earmark/);
  refused(function () { L.build([a], ctx({ partner: null })); }, 409, /No offtake partner/);
  var many = []; for (var i = 0; i <= L.MAX_SITES; i++) many.push(a);
  refused(function () { L.build(many, ctx({ partner: { key: 'lightsmith', name: 'L' } })); }, 400, /At most/);
});

test('P04 the contract case sizes the compute when there is one: its units, GPUs, kW and chipset', function () {
  var a = earmarked('a');
  var kase = { output: { sizing: { units: 6, gpus: 288, itKw: 450, byChipset: [] }, returns: { projectIrrPct: 54.2 }, priced: true, chipset: { key: 'h100', name: 'NVIDIA H100' } }, input: { chipset: 'h100' } };
  var pkg = L.build([a], ctx({ partner: { key: 'lightsmith', name: 'Lightsmith Energy' }, kases: { a: kase } }));
  assert.deepEqual([pkg.sites[0].compute.units, pkg.sites[0].compute.gpus, pkg.sites[0].compute.computeKw, pkg.sites[0].compute.basis], [6, 288, 450, 'the contract case']);
  assert.ok(JSON.stringify(pkg).indexOf('54.2') < 0, 'the case’s IRR stays home');
});

test('P05 the mail: one table, a row a site; names escaped; nothing reads undefined; the subject names the workspace, the partner and the compute', function () {
  var a = earmarked('a', { name: '<script>alert(1)</script> Yard', latestDesign: { compute: { units: 2, omegaCoreUnits: 2, kwIt: 150 } } });
  var pkg = L.build([a], ctx({ workspaceName: 'Solela & Sons', partner: { key: 'lightsmith', name: 'Lightsmith Energy' } }));
  var m = L.mail(pkg, { by: BY, note: 'Cards by Q3, please.\nSecond line' });
  assert.equal(m.subject, '[Solela & Sons] LOI package for Lightsmith Energy: 1 site · 0.15 MW of compute');
  assert.ok(m.html.indexOf('<script>') < 0 && m.html.indexOf('&lt;script&gt;alert(1)&lt;/script&gt; Yard') >= 0, 'a site name cannot run in the mail');
  assert.ok(/Solela &amp; Sons is sending Lightsmith Energy <b>1 site<\/b> for compute offtake, to a letter of intent on a 6-year term/.test(m.html), m.html.slice(0, 300));
  assert.ok(/Cards by Q3, please.<br>Second line/.test(m.html));
  assert.ok(/route not chosen/.test(m.html)); assert.ok(/carriers not on file/.test(m.html)); assert.ok(/nothing here is invented/.test(m.html));
  assert.ok(!/undefined|NaN|null/.test(m.html), 'every blank reads as not on file');
});

test('P06 once it is mailed, each site takes the LOI as sent and moves to LOI sent by the diligence\'s own rules, keeping the partner record', function () {
  var a = earmarked('a'), pkg = L.build([a], ctx({ partner: { key: 'lightsmith', name: 'Lightsmith Energy' } }));
  var r = L.sent(a.diligence, pkg, ctx({ site: a, to: ['deals@lightsmith.example'] }));
  assert.equal(r.diligence.stage, 'loi-sent'); assert.equal(r.diligence.offtake.loiStatus, 'sent');
  assert.deepEqual(r.events.map(function (e) { return e.what; }), ['offtake', 'stage']);
  assert.deepEqual(r.partnerRecord, { sentAt: NOW, by: BY, to: ['deals@lightsmith.example'], status: 'sent', packageId: pkg.packageId, sites: 1, kind: 'loi-package' });
  /* a site that is not earmarked cannot be moved by it */
  var n = site('n');
  refused(function () { L.sent(n.diligence, pkg, ctx({ site: n })); }, 409, /^Screened: Screen power/);
  assert.equal(L.DAILY_CAP, 5);
  var src = fs.readFileSync(path.join(ROOT, 'api/_lib/portfolio/loi-package.js'), 'utf8');
  assert.ok(src.indexOf('© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.') > 0);
  assert.ok(!/Lightsmith|Solela/.test(src.replace(/\/\*[\s\S]*?\*\//g, '')), 'the partner and the workspace come from config and the registry, never the code');
});

(async function () {
  for (var i = 0; i < queue.length; i++) {
    try { await queue[i][1](); passed++; console.log('PASS ' + queue[i][0]); }
    catch (e) { failed++; console.log('FAIL ' + queue[i][0] + '\n     ' + (e && e.stack || e).split('\n').slice(0, 4).join('\n     ')); }
  }
  console.log('loi package: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})();
